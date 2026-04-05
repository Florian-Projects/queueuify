from datetime import datetime, timedelta
from http import HTTPStatus

from fastapi import HTTPException

from models import User, UserAuthMode
from session.models import (
    GroupSession,
    SessionMemberModeration,
    SessionMemberResponse,
    SessionMemberTimeoutRequest,
)
from session.settings_service import ensure_session_settings


def _now_matching(reference: datetime | None = None):
    if reference is not None and reference.tzinfo is not None:
        return datetime.now(reference.tzinfo)

    return datetime.utcnow()


def _remaining_timeout_seconds(timeout_until: datetime | None):
    if timeout_until is None:
        return None

    remaining = int((timeout_until - _now_matching(timeout_until)).total_seconds())
    return max(remaining, 0)


def _format_remaining_timeout(timeout_until: datetime):
    remaining_seconds = _remaining_timeout_seconds(timeout_until)
    if remaining_seconds is None:
        return "0 seconds"

    minutes, seconds = divmod(remaining_seconds, 60)
    hours, minutes = divmod(minutes, 60)

    parts = []
    if hours:
        parts.append(f"{hours}h")
    if minutes:
        parts.append(f"{minutes}m")
    if seconds and not hours:
        parts.append(f"{seconds}s")

    return " ".join(parts) or "0 seconds"


async def _get_or_create_moderation(session: GroupSession, user: User):
    moderation = await SessionMemberModeration.get_or_none(session=session, user=user)
    if moderation is not None:
        return moderation

    moderation, _ = await SessionMemberModeration.get_or_create(session=session, user=user)
    return moderation


async def _normalize_timeout_state(moderation: SessionMemberModeration | None):
    if moderation is None or moderation.timeout_until is None:
        return moderation

    if _remaining_timeout_seconds(moderation.timeout_until) > 0:
        return moderation

    moderation.timeout_until = None
    moderation.timeout_set_at = None
    moderation.timeout_set_by_id = None
    await moderation.save(
        update_fields=["timeout_until", "timeout_set_at", "timeout_set_by_id"]
    )
    return moderation


def _member_response(
    user: User,
    *,
    is_active_member: bool,
    moderation: SessionMemberModeration | None,
):
    timeout_remaining_seconds = _remaining_timeout_seconds(
        moderation.timeout_until if moderation else None
    )
    is_timed_out = timeout_remaining_seconds is not None and timeout_remaining_seconds > 0
    is_banned = bool(moderation and moderation.is_banned)
    is_guest = user.auth_mode == UserAuthMode.ANONYMOUS

    return SessionMemberResponse(
        id=user.id,
        display_name=user.display_name,
        auth_mode=user.auth_mode.value,
        is_guest=is_guest,
        is_active_member=is_active_member,
        is_banned=is_banned,
        is_timed_out=is_timed_out,
        timeout_until=moderation.timeout_until if moderation else None,
        timeout_remaining_seconds=timeout_remaining_seconds,
        can_kick=is_active_member and not is_banned,
        can_ban=is_active_member and not is_banned and not is_guest,
        can_timeout=is_active_member and not is_banned and not is_timed_out,
        can_unban=is_banned,
        can_unmute=is_active_member and is_timed_out,
    )


async def list_session_members(session: GroupSession):
    active_members = await session.members.all()
    moderations = await SessionMemberModeration.filter(session=session).prefetch_related(
        "user"
    )
    moderation_by_user_id = {moderation.user_id: moderation for moderation in moderations}

    members = []
    seen_user_ids = set()

    for user in sorted(active_members, key=lambda item: item.display_name.lower()):
        moderation = await _normalize_timeout_state(moderation_by_user_id.get(user.id))
        members.append(
            _member_response(
                user,
                is_active_member=True,
                moderation=moderation,
            )
        )
        seen_user_ids.add(user.id)

    banned_moderations = [
        moderation
        for moderation in moderations
        if moderation.is_banned and moderation.user_id not in seen_user_ids
    ]
    banned_moderations.sort(
        key=lambda moderation: moderation.user.display_name.lower()
        if moderation.user is not None
        else ""
    )

    for moderation in banned_moderations:
        members.append(
            _member_response(
                moderation.user,
                is_active_member=False,
                moderation=moderation,
            )
        )

    return members


async def get_owned_session_or_404(host_user: User, token: str):
    session = await GroupSession.get_or_none(token=token)
    if session is None:
        raise HTTPException(
            status_code=HTTPStatus.NOT_FOUND,
            detail="Session not found.",
        )

    if session.owner_id != host_user.id:
        raise HTTPException(
            status_code=HTTPStatus.FORBIDDEN,
            detail="Only the host can manage room members.",
        )

    return session


async def _get_moderatable_user_or_404(session: GroupSession, member_id: int):
    if member_id == session.owner_id:
        raise HTTPException(
            status_code=HTTPStatus.NOT_FOUND,
            detail="Member not found.",
        )

    user = await User.get_or_none(id=member_id)
    if user is None:
        raise HTTPException(
            status_code=HTTPStatus.NOT_FOUND,
            detail="Member not found.",
        )

    return user


async def kick_member(session: GroupSession, host_user: User, member_id: int):
    user = await _get_moderatable_user_or_404(session, member_id)
    members = await session.members.all()
    if user not in members:
        raise HTTPException(
            status_code=HTTPStatus.CONFLICT,
            detail="User is not an active session member.",
        )

    await session.members.remove(user)
    return await list_session_members(session)


async def ban_member(session: GroupSession, host_user: User, member_id: int):
    user = await _get_moderatable_user_or_404(session, member_id)
    if user.auth_mode == UserAuthMode.ANONYMOUS:
        raise HTTPException(
            status_code=HTTPStatus.CONFLICT,
            detail=(
                "Guest users cannot be banned. Use the disallow guest users setting instead."
            ),
        )

    members = await session.members.all()
    if user not in members:
        raise HTTPException(
            status_code=HTTPStatus.CONFLICT,
            detail="User is not an active session member.",
        )

    moderation = await _get_or_create_moderation(session, user)
    moderation.is_banned = True
    moderation.banned_at = _now_matching(moderation.banned_at)
    moderation.banned_by_id = host_user.id
    moderation.timeout_until = None
    moderation.timeout_set_at = None
    moderation.timeout_set_by_id = None
    await moderation.save(
        update_fields=[
            "is_banned",
            "banned_at",
            "banned_by_id",
            "timeout_until",
            "timeout_set_at",
            "timeout_set_by_id",
        ]
    )
    await session.members.remove(user)
    return await list_session_members(session)


async def unban_member(session: GroupSession, member_id: int):
    user = await _get_moderatable_user_or_404(session, member_id)
    moderation = await SessionMemberModeration.get_or_none(session=session, user=user)
    if moderation is None or not moderation.is_banned:
        raise HTTPException(
            status_code=HTTPStatus.CONFLICT,
            detail="User is not currently banned.",
        )

    moderation.is_banned = False
    moderation.banned_at = None
    moderation.banned_by_id = None
    await moderation.save(update_fields=["is_banned", "banned_at", "banned_by_id"])
    return await list_session_members(session)


async def timeout_member(
    session: GroupSession,
    host_user: User,
    member_id: int,
    body: SessionMemberTimeoutRequest,
):
    if body.duration_minutes <= 0:
        raise HTTPException(
            status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
            detail="Timeout duration must be greater than zero.",
        )

    user = await _get_moderatable_user_or_404(session, member_id)
    members = await session.members.all()
    if user not in members:
        raise HTTPException(
            status_code=HTTPStatus.CONFLICT,
            detail="User is not an active session member.",
        )

    moderation = await _get_or_create_moderation(session, user)
    moderation.timeout_until = _now_matching(moderation.timeout_until) + timedelta(
        minutes=body.duration_minutes
    )
    moderation.timeout_set_at = _now_matching(moderation.timeout_until)
    moderation.timeout_set_by_id = host_user.id
    await moderation.save(
        update_fields=["timeout_until", "timeout_set_at", "timeout_set_by_id"]
    )
    return await list_session_members(session)


async def unmute_member(session: GroupSession, member_id: int):
    user = await _get_moderatable_user_or_404(session, member_id)
    moderation = await SessionMemberModeration.get_or_none(session=session, user=user)
    if moderation is None:
        raise HTTPException(
            status_code=HTTPStatus.CONFLICT,
            detail="User is not currently muted.",
        )

    moderation = await _normalize_timeout_state(moderation)
    if moderation.timeout_until is None:
        raise HTTPException(
            status_code=HTTPStatus.CONFLICT,
            detail="User is not currently muted.",
        )

    moderation.timeout_until = None
    moderation.timeout_set_at = None
    moderation.timeout_set_by_id = None
    await moderation.save(
        update_fields=["timeout_until", "timeout_set_at", "timeout_set_by_id"]
    )
    return await list_session_members(session)


async def ensure_user_can_join_session(session: GroupSession, user: User):
    settings = await ensure_session_settings(session)
    if settings.disallow_anonymous_users and user.auth_mode == UserAuthMode.ANONYMOUS:
        raise HTTPException(
            status_code=HTTPStatus.FORBIDDEN,
            detail="Anonymous users cannot join this session.",
        )

    moderation = await SessionMemberModeration.get_or_none(session=session, user=user)
    if moderation is not None and moderation.is_banned:
        raise HTTPException(
            status_code=HTTPStatus.FORBIDDEN,
            detail="You have been banned from this session.",
        )


async def ensure_user_can_add_to_queue(session: GroupSession, user: User):
    moderation = await SessionMemberModeration.get_or_none(session=session, user=user)
    moderation = await _normalize_timeout_state(moderation)
    if moderation is None or moderation.timeout_until is None:
        return

    raise HTTPException(
        status_code=HTTPStatus.FORBIDDEN,
        detail=(
            "You have been muted by the host for "
            f"{_format_remaining_timeout(moderation.timeout_until)}."
        ),
    )
