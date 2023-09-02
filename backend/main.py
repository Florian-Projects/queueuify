from datetime import datetime, timedelta
from functools import lru_cache
from secrets import token_urlsafe

import pytz
import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.authentication import (
    requires,
)
from starlette.middleware.authentication import AuthenticationMiddleware
from tortoise import exceptions
from tortoise.contrib.fastapi import register_tortoise

from authentication import BearerAuthBackend
from config.settings import Settings
from models import User, APIToken
from oauth.oauth import SpotifyOAuth
from spotify_connector.spotify import SpotifyConnector

utc = pytz.utc
app = FastAPI()


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

    db_token = await APIToken.update_or_create(
        owner=db_user,
        is_session_token=True,
        defaults={
            "token": token_urlsafe(32),
            "expiration_time": datetime.utcnow() + timedelta(hours=1),
        },
    )
    return db_token


@app.get("/logout")
@requires("authenticated")
async def log_out(request: Request):
    await request.user.get_session_token.delete()
    return {}


register_tortoise(
    app,
    db_url="mysql://docker:docker@127.0.0.1:3306/docker",
    modules={"models": ["models"]},
    generate_schemas=True,
    add_exception_handlers=True,
)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
