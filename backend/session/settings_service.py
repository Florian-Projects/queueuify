from http import HTTPStatus

from fastapi import HTTPException

from models import UserAuthMode
from session.models import (
    GroupSession,
    GroupSessionSettings,
    SessionSettingsResponse,
    SessionSettingsUpdateRequest,
    SessionSummaryResponse,
    SessionType,
)
from session.playback_sync import (
    build_everyone_playback_status_response,
    build_member_sync_status_response,
    collect_session_playback_target_states,
    get_room_playing_item,
)


async def ensure_session_settings(session: GroupSession):
    settings = await GroupSessionSettings.get_or_none(session_id=session.id)
    if settings is not None:
        return settings

    settings, _ = await GroupSessionSettings.get_or_create(session_id=session.id)
    return settings


def build_session_summary(
    session: GroupSession,
    *,
    is_owner: bool,
    settings: GroupSessionSettings,
):
    return SessionSummaryResponse(
        id=session.id,
        token=session.token,
        expiration_time=session.expiration_time,
        is_owner=is_owner,
        session_type=settings.session_type,
        playback_backend=settings.playback_backend,
        disallow_anonymous_users=settings.disallow_anonymous_users,
        explicit_filter=settings.explicit_filter,
    )


async def build_session_settings_response(
    session: GroupSession,
    settings: GroupSessionSettings | None = None,
):
    settings = settings or await ensure_session_settings(session)
    room_playing_item = await get_room_playing_item(session)
    room_track_uri = room_playing_item.spotify_track_uri if room_playing_item else None
    playback_target_states = await collect_session_playback_target_states(session, settings)
    member_sync_status = [
        build_member_sync_status_response(
            target_state,
            room_track_uri=room_track_uri,
        )
        for target_state in playback_target_states
    ]

    return SessionSettingsResponse(
        session_type=settings.session_type,
        playback_backend=settings.playback_backend,
        disallow_anonymous_users=settings.disallow_anonymous_users,
        explicit_filter=settings.explicit_filter,
        everyone_playback_status=build_everyone_playback_status_response(
            member_sync_status
        ),
        member_sync_status=member_sync_status,
    )


async def update_session_settings(
    session: GroupSession,
    body: SessionSettingsUpdateRequest,
):
    settings = await ensure_session_settings(session)
    next_disallow_anonymous_users = (
        body.disallow_anonymous_users
        if body.disallow_anonymous_users is not None
        else settings.disallow_anonymous_users
    )
    next_session_type = body.session_type or settings.session_type
    next_explicit_filter = (
        body.explicit_filter
        if body.explicit_filter is not None
        else settings.explicit_filter
    )

    if (
        next_session_type == SessionType.EVERYONE
        and not next_disallow_anonymous_users
    ):
        raise HTTPException(
            status_code=HTTPStatus.CONFLICT,
            detail="Everyone mode requires Disallow anonymous users.",
        )

    settings.session_type = next_session_type
    settings.disallow_anonymous_users = next_disallow_anonymous_users
    settings.explicit_filter = next_explicit_filter
    await settings.save(
        update_fields=[
            "session_type",
            "disallow_anonymous_users",
            "explicit_filter",
        ]
    )

    if next_disallow_anonymous_users:
        anonymous_members = await session.members.filter(
            auth_mode=UserAuthMode.ANONYMOUS
        )
        if anonymous_members:
            await session.members.remove(*anonymous_members)

    return settings
