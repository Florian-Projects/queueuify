import secrets
import string
from http import HTTPStatus

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.authentication import requires
from tortoise.exceptions import DoesNotExist

from session.models import GroupSession, PGroupSession
from spotify_connector.spotify import SpotifyConnector

router = APIRouter()


@router.get("/")
async def get_session():
    pass


@router.post(
    "/",
    response_model=PGroupSession,
    responses={
        HTTPStatus.CONFLICT.value: {
            "description": "The user already has an active session",
            "content": {
                "application/json": {
                    "example": {"details": "The user already has an active session"}
                }
            },
        },
    },
)
@requires(["authenticated"])
async def create_session(request: Request):
    user = request.user
    token_exists = True
    while token_exists:
        token = "".join(
            secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6)
        )
        if not await GroupSession.filter(token=token).exists():
            token_exists = False

    if await user.owned_session.exists():
        return JSONResponse(
            status_code=HTTPStatus.CONFLICT.value,
            content={"details": "The user already owns a session"},
        )

    session = await GroupSession.create(owner=user, token=token)
    return await PGroupSession.from_tortoise_orm(session)


@router.delete(
    "/",
    responses={
        HTTPStatus.NOT_FOUND.value: {
            "description": "The User has no active session",
            "content": {
                "application/json": {
                    "example": {"details": "The User has no active session"}
                }
            },
        },
    },
)
@requires(["authenticated"])
async def close_session(request: Request):
    user = request.user
    if session := await user.owned_session:
        await session.delete()
        return {}

    else:
        return JSONResponse(
            status_code=HTTPStatus.NOT_FOUND.value,
            content={"details": "The User has no active session"},
        )


@router.get("/{token}/join")
@requires(["authenticated"])
async def join_session(request: Request, token: str):
    try:
        session = await GroupSession.get(token=token)
    except DoesNotExist:
        return JSONResponse(
            status_code=HTTPStatus.NOT_FOUND.value,
            content={"detail": "Session not found"},
        )

    if (
        request.user in await session.members
        or request.user == await session.owner.first()
    ):
        return JSONResponse(
            status_code=HTTPStatus.CONFLICT,
            content={"detail": "User is already a member of the session"},
        )
    await session.members.add(request.user)
    return {}


@router.put("/{token}/queue")
@requires(["authenticated"])
async def add_song_to_session_queue(request: Request, token: str, song_id: str):
    try:
        session = await GroupSession.get(token=token)
    except DoesNotExist:
        return JSONResponse(
            status_code=HTTPStatus.NOT_FOUND.value,
            content={"detail": "Session not found"},
        )
    session_owner = await session.owner.first()
    if request.user not in await session.members and request.user != session_owner:
        return JSONResponse(
            status_code=HTTPStatus.FORBIDDEN,
            content={"detail": "User is not a member of the session"},
        )

    connector = SpotifyConnector(session_owner.access_token)
    success = await connector.add_song_to_queue(song_id)
    return {"Success": success}
