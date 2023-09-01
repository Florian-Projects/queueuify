import binascii
from datetime import datetime
from functools import lru_cache

import pytz
import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.authentication import (
    AuthenticationBackend,
    AuthenticationError,
    AuthCredentials,
    requires,
)
from starlette.middleware.authentication import AuthenticationMiddleware
from starlette.requests import HTTPConnection
from tortoise import exceptions
from tortoise.contrib.fastapi import register_tortoise

from config.settings import Settings
from models import User, APIToken
from oauth.oauth import SpotifyOAuth
from spotify_connector.spotify import SpotifyConnector

utc = pytz.utc
app = FastAPI()


class BearerAuthBackend(AuthenticationBackend):
    # for some reason when starlet is calling the function
    # it does so from a class object instead of an initialized class
    @classmethod
    async def authenticate(cls, conn: HTTPConnection):
        if "Authorization" not in conn.headers:
            return

        auth = conn.headers["Authorization"]
        try:
            scheme, token = auth.split()
            if scheme.lower() != "bearer":
                return

            if db_token := await APIToken.filter(token=token).first():
                if db_token.expiration_time > datetime.now(utc):
                    user = await db_token.owner
                    return AuthCredentials(["authenticated"]), user
                else:
                    await db_token.delete()
            return

        except (ValueError, UnicodeDecodeError, binascii.Error) as exc:
            raise AuthenticationError("Invalid basic auth credentials")


@lru_cache()
def get_settings():
    return Settings()


settings = get_settings()
spotify_oauth = SpotifyOAuth(
    client_id=settings.spotify_client_id,
    client_secret=settings.spotify_client_secret,
    redirect_uri=settings.redirect_uri,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(AuthenticationMiddleware, backend=BearerAuthBackend)


@app.get("/status")
@requires("authenticated")
def status(request: Request):
    return {"Ok": True}


@app.get("/login")
async def login():
    state = "my_random_state"
    authorization_url = await spotify_oauth.get_authorization_url(
        state, scope="user-read-currently-playing user-modify-playback-state"
    )
    return {"authorization_url": str(authorization_url)}


@app.get("/oauth_callback")
async def oauth_callback(code: str):
    access_token, refresh_token = await spotify_oauth.get_access_token(code)
    spotify_connector = SpotifyConnector(access_token)
    user = await spotify_connector.get_current_user_detail()

    try:
        db_user = await User.get(external_user_id=user.id)
    except exceptions.DoesNotExist:
        db_user = await User.create(
            external_user_id=user.id,
            display_name=user.display_name,
            access_token=access_token,
            refresh_token=refresh_token,
        )
    return db_user


register_tortoise(
    app,
    db_url="mysql://docker:docker@127.0.0.1:3306/docker",
    modules={"models": ["models"]},
    generate_schemas=True,
    add_exception_handlers=True,
)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
