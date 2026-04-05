import secrets
import string
from http import HTTPStatus

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.authentication import requires
from tortoise.exceptions import DoesNotExist

from session.models import (
    GroupSession,
    QueueTrackRequest,
    SessionMemberResponse,
    SessionMemberTimeoutRequest,
    SessionQueueProjectionResponse,
    SessionSettingsResponse,
    SessionSettingsUpdateRequest,
    SessionSummaryResponse,
)
from session.member_service import (
    ban_member,
    ensure_user_can_add_to_queue,
    ensure_user_can_join_session,
    get_owned_session_or_404,
    kick_member,
    list_session_members,
    timeout_member,
    unban_member,
    unmute_member,
)
from session.queue_service import (
    add_track_to_queue,
    get_queue_projection,
    pause_playback,
    play_queue_item_now,
    play_track_now,
    remove_blocked_explicit_queue_items,
    remove_queue_item,
    resume_playback,
    skip_to_next,
    skip_to_previous,
)
from session.settings_service import (
    build_session_settings_response,
    build_session_summary,
    ensure_session_settings,
    update_session_settings,
)
from session.utils import can_create_session, can_host_sessions, get_active_session

router = APIRouter()


@router.get("")
@requires(["authenticated"])
async def get_session(request: Request):
    if session := await get_active_session(request.user):
        settings = await ensure_session_settings(session)
        return build_session_summary(
            session,
            is_owner=session.owner_id == request.user.id,
            settings=settings,
        )

    return JSONResponse(
        status_code=HTTPStatus.NOT_FOUND, content={"details": "User not in session"}
    )


@router.post(
    "",
    response_model=SessionSummaryResponse,
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
    if not can_host_sessions(user):
        return JSONResponse(
            status_code=HTTPStatus.FORBIDDEN,
            content={"details": "Anonymous users cannot create sessions"},
        )

    if not await can_create_session(user):
        return JSONResponse(
            status_code=HTTPStatus.CONFLICT,
            content={"details": "User already in session"},
        )

    token_exists = True
    while token_exists:
        token = "".join(
            secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6)
        )
        if not await GroupSession.filter(token=token).exists():
            token_exists = False

    session = await GroupSession.create(owner=user, token=token)
    settings = await ensure_session_settings(session)
    return build_session_summary(session, is_owner=True, settings=settings)


@router.delete(
    "",
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


@router.post("/{token}/join")
@requires(["authenticated"])
async def join_session(request: Request, token: str):
    try:
        session = await GroupSession.get(token=token)
    except DoesNotExist:
        return JSONResponse(
            status_code=HTTPStatus.NOT_FOUND.value,
            content={"detail": "Session not found"},
        )

    await ensure_user_can_join_session(session, request.user)
    members = await session.members.all()
    if request.user.id == session.owner_id or request.user in members:
        return JSONResponse(
            status_code=HTTPStatus.CONFLICT,
            content={"detail": "User is already a member of the session"},
        )
    await session.members.add(request.user)
    return {}


@router.post("/{token}/leave")
@requires(["authenticated"])
async def leave_session(request: Request, token: str):
    try:
        session = await GroupSession.get(token=token)
    except DoesNotExist:
        return JSONResponse(
            status_code=HTTPStatus.NOT_FOUND.value,
            content={"detail": "Session not found"},
        )

    if request.user.id == session.owner_id:
        return JSONResponse(
            status_code=HTTPStatus.CONFLICT,
            content={"detail": "Can't leave owned group"},
        )

    members = await session.members.all()
    if request.user not in members:
        return JSONResponse(
            status_code=HTTPStatus.CONFLICT,
            content={"detail": "Can't leave group you're not a member of"},
        )

    await session.members.remove(request.user)
    return {}


@router.get("/{token}/settings", response_model=SessionSettingsResponse)
@requires(["authenticated"])
async def get_settings(request: Request, token: str):
    session = await get_owned_session_or_404(request.user, token)
    return await build_session_settings_response(session)


@router.patch("/{token}/settings", response_model=SessionSettingsResponse)
@requires(["authenticated"])
async def patch_settings(
    request: Request,
    token: str,
    body: SessionSettingsUpdateRequest,
):
    session = await get_owned_session_or_404(request.user, token)
    settings = await update_session_settings(session, body)
    await remove_blocked_explicit_queue_items(session, settings)
    return await build_session_settings_response(session, settings)


@router.get("/{token}/queue", response_model=SessionQueueProjectionResponse)
@requires(["authenticated"])
async def get_queue_content(request: Request, token: str):
    try:
        session = await GroupSession.get(token=token)
    except DoesNotExist:
        return JSONResponse(
            status_code=HTTPStatus.NOT_FOUND.value,
            content={"detail": "Session not found"},
        )

    members = await session.members.all()
    if request.user.id != session.owner_id and request.user not in members:
        return JSONResponse(
            status_code=HTTPStatus.FORBIDDEN,
            content={"detail": "User is not a member of the session"},
        )

    return await get_queue_projection(session, request.user)


@router.post("/{token}/queue/items", response_model=SessionQueueProjectionResponse)
@requires(["authenticated"])
async def add_song_to_session_queue(
    request: Request,
    token: str,
    body: QueueTrackRequest,
):
    try:
        session = await GroupSession.get(token=token)
    except DoesNotExist:
        return JSONResponse(
            status_code=HTTPStatus.NOT_FOUND.value,
            content={"detail": "Session not found"},
        )
    members = await session.members.all()
    if request.user.id != session.owner_id and request.user not in members:
        return JSONResponse(
            status_code=HTTPStatus.FORBIDDEN,
            content={"detail": "User is not a member of the session"},
        )

    await ensure_user_can_add_to_queue(session, request.user)
    return await add_track_to_queue(session, request.user, body)


@router.post("/{token}/playback/play-now", response_model=SessionQueueProjectionResponse)
@requires(["authenticated"])
async def play_track_immediately(
    request: Request,
    token: str,
    body: QueueTrackRequest,
):
    try:
        session = await GroupSession.get(token=token)
    except DoesNotExist:
        return JSONResponse(
            status_code=HTTPStatus.NOT_FOUND.value,
            content={"detail": "Session not found"},
        )

    members = await session.members.all()
    if request.user.id != session.owner_id and request.user not in members:
        return JSONResponse(
            status_code=HTTPStatus.FORBIDDEN,
            content={"detail": "User is not a member of the session"},
        )

    return await play_track_now(session, request.user, body)


@router.post(
    "/{token}/playback/pause",
    response_model=SessionQueueProjectionResponse,
)
@requires(["authenticated"])
async def pause_room_playback(request: Request, token: str):
    try:
        session = await GroupSession.get(token=token)
    except DoesNotExist:
        return JSONResponse(
            status_code=HTTPStatus.NOT_FOUND.value,
            content={"detail": "Session not found"},
        )

    members = await session.members.all()
    if request.user.id != session.owner_id and request.user not in members:
        return JSONResponse(
            status_code=HTTPStatus.FORBIDDEN,
            content={"detail": "User is not a member of the session"},
        )

    return await pause_playback(session, request.user)


@router.post(
    "/{token}/playback/resume",
    response_model=SessionQueueProjectionResponse,
)
@requires(["authenticated"])
async def resume_room_playback(request: Request, token: str):
    try:
        session = await GroupSession.get(token=token)
    except DoesNotExist:
        return JSONResponse(
            status_code=HTTPStatus.NOT_FOUND.value,
            content={"detail": "Session not found"},
        )

    members = await session.members.all()
    if request.user.id != session.owner_id and request.user not in members:
        return JSONResponse(
            status_code=HTTPStatus.FORBIDDEN,
            content={"detail": "User is not a member of the session"},
        )

    return await resume_playback(session, request.user)


@router.post(
    "/{token}/playback/next",
    response_model=SessionQueueProjectionResponse,
)
@requires(["authenticated"])
async def skip_room_playback_next(request: Request, token: str):
    try:
        session = await GroupSession.get(token=token)
    except DoesNotExist:
        return JSONResponse(
            status_code=HTTPStatus.NOT_FOUND.value,
            content={"detail": "Session not found"},
        )

    members = await session.members.all()
    if request.user.id != session.owner_id and request.user not in members:
        return JSONResponse(
            status_code=HTTPStatus.FORBIDDEN,
            content={"detail": "User is not a member of the session"},
        )

    return await skip_to_next(session, request.user)


@router.post(
    "/{token}/playback/previous",
    response_model=SessionQueueProjectionResponse,
)
@requires(["authenticated"])
async def skip_room_playback_previous(request: Request, token: str):
    try:
        session = await GroupSession.get(token=token)
    except DoesNotExist:
        return JSONResponse(
            status_code=HTTPStatus.NOT_FOUND.value,
            content={"detail": "Session not found"},
        )

    members = await session.members.all()
    if request.user.id != session.owner_id and request.user not in members:
        return JSONResponse(
            status_code=HTTPStatus.FORBIDDEN,
            content={"detail": "User is not a member of the session"},
        )

    return await skip_to_previous(session, request.user)


@router.post(
    "/{token}/queue/items/{item_id}/play",
    response_model=SessionQueueProjectionResponse,
)
@requires(["authenticated"])
async def play_queue_item(
    request: Request,
    token: str,
    item_id: int,
):
    try:
        session = await GroupSession.get(token=token)
    except DoesNotExist:
        return JSONResponse(
            status_code=HTTPStatus.NOT_FOUND.value,
            content={"detail": "Session not found"},
        )

    members = await session.members.all()
    if request.user.id != session.owner_id and request.user not in members:
        return JSONResponse(
            status_code=HTTPStatus.FORBIDDEN,
            content={"detail": "User is not a member of the session"},
        )

    return await play_queue_item_now(session, request.user, item_id)


@router.delete(
    "/{token}/queue/items/{item_id}",
    response_model=SessionQueueProjectionResponse,
)
@requires(["authenticated"])
async def delete_queue_item(
    request: Request,
    token: str,
    item_id: int,
):
    try:
        session = await GroupSession.get(token=token)
    except DoesNotExist:
        return JSONResponse(
            status_code=HTTPStatus.NOT_FOUND.value,
            content={"detail": "Session not found"},
        )

    members = await session.members.all()
    if request.user.id != session.owner_id and request.user not in members:
        return JSONResponse(
            status_code=HTTPStatus.FORBIDDEN,
            content={"detail": "User is not a member of the session"},
        )

    return await remove_queue_item(session, request.user, item_id)


@router.get("/members", response_model=list[SessionMemberResponse])
@requires(["authenticated"])
async def get_session_member(request: Request):
    session = await request.user.owned_session
    if session is None:
        return JSONResponse(
            status_code=HTTPStatus.NOT_FOUND,
            content={"details": "User is not the owner of any session"},
        )

    return await list_session_members(session)


@router.post(
    "/{token}/members/{member_id}/kick",
    response_model=list[SessionMemberResponse],
)
@requires(["authenticated"])
async def kick_session_member(request: Request, token: str, member_id: int):
    session = await get_owned_session_or_404(request.user, token)
    return await kick_member(session, request.user, member_id)


@router.post(
    "/{token}/members/{member_id}/ban",
    response_model=list[SessionMemberResponse],
)
@requires(["authenticated"])
async def ban_session_member(request: Request, token: str, member_id: int):
    session = await get_owned_session_or_404(request.user, token)
    return await ban_member(session, request.user, member_id)


@router.post(
    "/{token}/members/{member_id}/unban",
    response_model=list[SessionMemberResponse],
)
@requires(["authenticated"])
async def unban_session_member(request: Request, token: str, member_id: int):
    session = await get_owned_session_or_404(request.user, token)
    return await unban_member(session, member_id)


@router.post(
    "/{token}/members/{member_id}/timeout",
    response_model=list[SessionMemberResponse],
)
@requires(["authenticated"])
async def timeout_session_member(
    request: Request,
    token: str,
    member_id: int,
    body: SessionMemberTimeoutRequest,
):
    session = await get_owned_session_or_404(request.user, token)
    return await timeout_member(session, request.user, member_id, body)


@router.post(
    "/{token}/members/{member_id}/unmute",
    response_model=list[SessionMemberResponse],
)
@requires(["authenticated"])
async def unmute_session_member(request: Request, token: str, member_id: int):
    session = await get_owned_session_or_404(request.user, token)
    return await unmute_member(session, member_id)
