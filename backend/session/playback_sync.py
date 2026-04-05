from dataclasses import dataclass

from playback import get_playback_provider
from playback.base import ProviderPlaybackState
from playback.state_cache import get_cached_playback_state
from spotify_connector.spotify import SpotifyException
from models import User, UserAuthMode
from session.models import (
    EveryonePlaybackStatusResponse,
    GroupSession,
    GroupSessionSettings,
    QueueItemStatus,
    SessionPlaybackSyncState,
    SessionPlaybackTargetStatusResponse,
    SessionQueueItem,
)


@dataclass
class SessionPlaybackTargetState:
    user: User
    is_host: bool
    provider_state: ProviderPlaybackState | None = None
    error_detail: str | None = None

    @property
    def eligible_for_everyone_playback(self) -> bool:
        return (
            self.user.auth_mode == UserAuthMode.SPOTIFY
            and bool(self.user.access_token)
        )

    @property
    def can_start_playback(self) -> bool:
        return (
            self.eligible_for_everyone_playback
            and self.provider_state is not None
            and self.provider_state.device_available
            and not self.provider_state.device_is_restricted
        )


async def list_session_participants(session: GroupSession):
    owner = await session.owner
    members = await session.members.all()
    return [owner, *members]


async def get_room_playing_item(session: GroupSession):
    return await SessionQueueItem.get_or_none(
        session=session,
        status=QueueItemStatus.PLAYING,
    )


async def collect_session_playback_target_states(
    session: GroupSession,
    settings: GroupSessionSettings,
):
    provider = get_playback_provider(settings.playback_backend)
    participants = await list_session_participants(session)
    target_states: list[SessionPlaybackTargetState] = []

    for user in participants:
        target_state = SessionPlaybackTargetState(
            user=user,
            is_host=user.id == session.owner_id,
        )
        if not target_state.eligible_for_everyone_playback:
            target_states.append(target_state)
            continue

        try:
            target_state.provider_state = await get_cached_playback_state(
                provider,
                user,
            )
        except SpotifyException as exc:
            target_state.error_detail = str(exc.detail)

        target_states.append(target_state)

    return target_states


def _build_status_message(
    target_state: SessionPlaybackTargetState,
    *,
    room_track_uri: str | None,
):
    if target_state.user.auth_mode == UserAuthMode.ANONYMOUS:
        return "Anonymous users are excluded from Everyone playback."

    if not target_state.user.access_token:
        return "Spotify sign-in is required before this member can be synced."

    if target_state.error_detail:
        return target_state.error_detail

    provider_state = target_state.provider_state
    if provider_state is None or not provider_state.device_available:
        return "No active Spotify device is available."

    if provider_state.device_is_restricted:
        return "The active Spotify device cannot be controlled."

    if room_track_uri:
        if provider_state.current_track and provider_state.current_track.uri == room_track_uri:
            return "Currently synced to room playback."

        return "Ready, but not currently synced to the room track."

    return "Ready for Everyone playback."


def _build_sync_state(
    target_state: SessionPlaybackTargetState,
    *,
    room_track_uri: str | None,
):
    if target_state.user.auth_mode == UserAuthMode.ANONYMOUS:
        return SessionPlaybackSyncState.ANONYMOUS_USER

    if not target_state.user.access_token:
        return SessionPlaybackSyncState.NO_SPOTIFY_SESSION

    if target_state.error_detail:
        return SessionPlaybackSyncState.PLAYBACK_ERROR

    provider_state = target_state.provider_state
    if provider_state is None or not provider_state.device_available:
        return SessionPlaybackSyncState.NO_ACTIVE_DEVICE

    if provider_state.device_is_restricted:
        return SessionPlaybackSyncState.RESTRICTED_DEVICE

    if room_track_uri:
        if provider_state.current_track and provider_state.current_track.uri == room_track_uri:
            return SessionPlaybackSyncState.SYNCED
        return SessionPlaybackSyncState.OUT_OF_SYNC

    return SessionPlaybackSyncState.READY


def build_member_sync_status_response(
    target_state: SessionPlaybackTargetState,
    *,
    room_track_uri: str | None,
):
    provider_state = target_state.provider_state
    return SessionPlaybackTargetStatusResponse(
        user_id=target_state.user.id,
        display_name=target_state.user.display_name,
        auth_mode=target_state.user.auth_mode.value,
        is_host=target_state.is_host,
        eligible_for_everyone_playback=target_state.eligible_for_everyone_playback,
        device_available=provider_state.device_available if provider_state else False,
        device_is_restricted=provider_state.device_is_restricted if provider_state else False,
        is_playing=provider_state.is_playing if provider_state else False,
        sync_state=_build_sync_state(target_state, room_track_uri=room_track_uri),
        status_message=_build_status_message(
            target_state,
            room_track_uri=room_track_uri,
        ),
    )


def build_everyone_playback_status_response(
    member_sync_status: list[SessionPlaybackTargetStatusResponse],
):
    eligible_members = [
        member for member in member_sync_status if member.eligible_for_everyone_playback
    ]
    ready_members = [
        member
        for member in eligible_members
        if member.sync_state
        in {
            SessionPlaybackSyncState.READY,
            SessionPlaybackSyncState.SYNCED,
            SessionPlaybackSyncState.OUT_OF_SYNC,
        }
    ]
    unsynced_members = [
        member for member in eligible_members if member not in ready_members
    ]

    if not eligible_members:
        status_message = "No joined Spotify members are currently eligible for Everyone playback."
    elif not ready_members:
        status_message = (
            "No joined Spotify members currently have a controllable Spotify device."
        )
    elif not unsynced_members:
        status_message = "Everyone playback is ready on all joined Spotify members."
    else:
        status_message = (
            f"Everyone playback is ready on {len(ready_members)} of "
            f"{len(eligible_members)} joined Spotify members."
        )

    return EveryonePlaybackStatusResponse(
        ready_member_count=len(ready_members),
        unsynced_member_count=len(unsynced_members),
        eligible_member_count=len(eligible_members),
        can_start_everyone_playback=bool(ready_members),
        status_message=status_message,
    )
