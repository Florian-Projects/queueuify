import uuid
from http import HTTPStatus
from datetime import datetime, timedelta
from secrets import token_urlsafe

import pytz
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.authentication import (
    requires,
)
from starlette.middleware.authentication import AuthenticationMiddleware
from tortoise import exceptions
from tortoise.contrib.fastapi import register_tortoise

from authentication import BearerAuthBackend
from config.settings import get_settings
from models import (
    APIToken,
    CurrentUserResponse,
    OAuthCodeRequest,
    SessionTokenResponse,
    User,
    UserAuthMode,
    default_api_token_expiration,
)
from oauth.oauth import spotify_oauth
from session import session
from session.utils import get_active_session
from spotify import spotify
from spotify_connector.spotify import SpotifyConnector

utc = pytz.utc

settings = get_settings()
app = FastAPI(root_path=settings.root_path)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4200",
        "http://127.0.0.1:4200",
        "http://192.168.2.57:4200",
        "http://127.0.0.1",
        "https://127.0.0.1",
        "http://localhost",
        "https://localhost",
        "http://localhost:8000",
        "https://localhost:8000",
        "http://127.0.0.1",
        "https://127.0.0.1",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(AuthenticationMiddleware, backend=BearerAuthBackend)

app.include_router(session.router, prefix="/session", tags=["session"])
app.include_router(spotify.router, prefix="/spotify", tags=["spotify"])


def build_current_user_response(user: User) -> CurrentUserResponse:
    return CurrentUserResponse(
        auth_mode=user.auth_mode,
        can_host_sessions=user.can_host_sessions,
        display_name=user.display_name,
    )


async def issue_session_token(user: User) -> APIToken:
    db_token, _ = await APIToken.update_or_create(
        owner=user,
        is_session_token=True,
        defaults={
            "token": token_urlsafe(32),
            "expiration_time": default_api_token_expiration(),
        },
    )
    return db_token


def build_session_token_response(user: User, token: str) -> SessionTokenResponse:
    return SessionTokenResponse(api_token=token, **build_current_user_response(user).model_dump())


def build_anonymous_display_name():
    suffix = token_urlsafe(4).replace("-", "").replace("_", "").upper()[:6]
    return f"Guest {suffix}"


async def create_anonymous_user_session():
    db_user = await User.create(
        auth_mode=UserAuthMode.ANONYMOUS,
        display_name=build_anonymous_display_name(),
    )
    db_token = await issue_session_token(db_user)
    return build_session_token_response(db_user, db_token.token)


@app.get("/status")
def status():
    return {"Ok": True}


@app.get("/login")
async def login(state: str):
    if state == "anonymous":
        return await create_anonymous_user_session()

    authorization_url = await spotify_oauth.get_authorization_url(
        state,
        scope="user-read-currently-playing user-modify-playback-state user-read-playback-state",
    )
    return {"authorization_url": str(authorization_url)}


@app.post("/login/anonymous", response_model=SessionTokenResponse)
async def login_anonymous():
    return await create_anonymous_user_session()


@app.post("/exchange_oauth_code", response_model=SessionTokenResponse)
async def oauth_callback(body: OAuthCodeRequest):
    access_token, refresh_token = await spotify_oauth.exchange_code_for_token(body.code)

    async with await SpotifyConnector.create(access_token=access_token) as spotify_connector:
        user = await spotify_connector.get_current_user_detail()

    try:
        db_user = await User.get(external_user_id=user.id)
        db_user.auth_mode = UserAuthMode.SPOTIFY
        db_user.display_name = user.display_name or user.id
        db_user.access_token = access_token
        db_user.refresh_token = refresh_token
        await db_user.save(
            update_fields=["auth_mode", "display_name", "refresh_token", "access_token"]
        )
    except exceptions.DoesNotExist:
        db_user = await User.create(
            auth_mode=UserAuthMode.SPOTIFY,
            external_user_id=user.id,
            display_name=user.display_name or user.id,
            access_token=access_token,
            refresh_token=refresh_token,
        )

    db_token = await issue_session_token(db_user)
    return build_session_token_response(db_user, db_token.token)


@app.get("/me", response_model=CurrentUserResponse)
@requires("authenticated")
async def current_user(request: Request):
    return build_current_user_response(request.user)


@app.get("/logout")
@requires("authenticated")
async def log_out(request: Request):
    user = request.user
    if active_session := await get_active_session(user):
        if active_session.owner_id == user.id:
            await active_session.delete()
        else:
            await active_session.members.remove(user)

    await APIToken.filter(owner=user, is_session_token=True).delete()
    if user.is_anonymous:
        await user.delete()
    else:
        user.access_token = None
        user.refresh_token = None
        await user.save(update_fields=["access_token", "refresh_token"])

    return {}


register_tortoise(
    app,
    db_url=f"mysql://{settings.db_user}:{settings.db_password}@{settings.db_host}:{settings.db_port}/{settings.db_name}",
    modules={"models": ["models", "session.models"]},
    generate_schemas=True,
    add_exception_handlers=True,
)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
