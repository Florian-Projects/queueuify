from datetime import datetime, timedelta
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
from session import session
from spotify import spotify
from models import User, APIToken, OAuthCodeRequest
from oauth.oauth import spotify_oauth
from spotify_connector.spotify import SpotifyConnector

utc = pytz.utc

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4200",
        "http://127.0.0.1:4200",
        "http://192.168.2.57:4200",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(AuthenticationMiddleware, backend=BearerAuthBackend)

app.include_router(session.router, prefix="/session", tags=["session"])
app.include_router(spotify.router, prefix="/spotify", tags=["spotify"])


@app.get("/status")
def status():
    return {"Ok": True}


@app.get("/login")
async def login(state: str):
    authorization_url = await spotify_oauth.get_authorization_url(
        state,
        scope="user-read-currently-playing user-modify-playback-state user-read-playback-state",
    )
    return {"authorization_url": str(authorization_url)}


@app.post("/exchange_oauth_code")
async def oauth_callback(body: OAuthCodeRequest):
    access_token, refresh_token = await spotify_oauth.exchange_code_for_token(body.code)

    spotify_connector = await SpotifyConnector.create(access_token=access_token)
    user = await spotify_connector.get_current_user_detail()

    try:
        db_user = await User.get(external_user_id=user.id)
        db_user.access_token = access_token
        db_user.refresh_token = refresh_token
        await db_user.save(update_fields=["refresh_token", "access_token"])
    except exceptions.DoesNotExist:
        db_user = await User.create(
            external_user_id=user.id,
            display_name=user.display_name,
            access_token=access_token,
            refresh_token=refresh_token,
        )

    db_token, created = await APIToken.update_or_create(
        owner=db_user,
        is_session_token=True,
        defaults={
            "token": token_urlsafe(32),
            "expiration_time": datetime.utcnow() + timedelta(hours=1),
        },
    )
    return {"api_token": db_token.token}


@app.get("/logout")
@requires("authenticated")
async def log_out(request: Request):
    await request.user.delete()
    return {}


register_tortoise(
    app,
    db_url="mysql://docker:docker@127.0.0.1:3306/docker",
    modules={"models": ["models", "session.models"]},
    generate_schemas=True,
    add_exception_handlers=True,
)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
