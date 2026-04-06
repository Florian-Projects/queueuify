import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from playback import get_playback_provider
from playback.base import ProviderPlaybackState
from playback.state_cache import (
    get_cached_playback_state,
    invalidate_many_cached_playback_states,
)
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

SYNC_POSITION_TOLERANCE_MS = 2500
SYNC_CORRECTION_COOLDOWN = timedelta(seconds=2)

_TARGET_SYNC_LOCKS: dict[str, asyncio.Lock] = {}
_LAST_TARGET_CORRECTIONS: dict[str, datetime] = {}


@dataclass
class SessionPlaybackTargetState:
    user: User
    is_host: bool
    is_leader: bool = False
    provider_state: ProviderPlaybackState | None = None
    error_detail: str | None = None
    progress_delta_ms: int | None = None
    sync_state: SessionPlaybackSyncState | None = None

    @property
    def eligible_for_everyone_playback(self) -> bool:
        return (
            self.user.auth_mode == UserAuthMode.SPOTIFY
            and bool(self.user.access_token)
        )

    @property
    def has_controllable_device(self) -> bool:
        return (
            self.eligible_for_everyone_playback
            and self.provider_state is not None
            and self.provider_state.device_available
            and not self.provider_state.device_is_restricted
        )

    @property
    def following_room(self) -> bool:
        return (
            not self.is_leader
            and self.has_controllable_device
            and self.sync_state
            not in {
                SessionPlaybackSyncState.PAUSED,
                SessionPlaybackSyncState.NO_ACTIVE_DEVICE,
                SessionPlaybackSyncState.RESTRICTED_DEVICE,
                SessionPlaybackSyncState.NO_SPOTIFY_SESSION,
                SessionPlaybackSyncState.ANONYMOUS_USER,
                SessionPlaybackSyncState.PLAYBACK_ERROR,
            }
        )

    @property
    def participates_in_room_playback(self) -> bool:
        return self.has_controllable_device and (self.is_leader or self.following_room)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _target_key(session_id: int, user_id: int) -> str:
    return f"{session_id}:{user_id}"


def _target_sync_lock(session_id: int, user_id: int) -> asyncio.Lock:
    key = _target_key(session_id, user_id)
    if key not in _TARGET_SYNC_LOCKS:
        _TARGET_SYNC_LOCKS[key] = asyncio.Lock()
    return _TARGET_SYNC_LOCKS[key]


def _leader_target(target_states: list[SessionPlaybackTargetState]):
    host_target = next((target_state for target_state in target_states if target_state.is_host), None)
    if host_target is not None:
        return host_target

    return next(
        (target_state for target_state in target_states if target_state.eligible_for_everyone_playback),
        None,
    )


def _leader_playback_state(target_states: list[SessionPlaybackTargetState]):
    leader_target = _leader_target(target_states)
    return leader_target.provider_state if leader_target else None


def _leader_track_uri(target_states: list[SessionPlaybackTargetState]) -> str | None:
    leader_state = _leader_playback_state(target_states)
    if not leader_state or not leader_state.current_track:
        return None

    return leader_state.current_track.uri


def _progress_delta_ms(
    leader_state: ProviderPlaybackState | None,
    target_state: SessionPlaybackTargetState,
):
    provider_state = target_state.provider_state
    if (
        leader_state is None
        or leader_state.current_track is None
        or provider_state is None
        or provider_state.current_track is None
        or leader_state.current_track.uri != provider_state.current_track.uri
        or leader_state.progress_ms is None
        or provider_state.progress_ms is None
    ):
        return None

    return abs(int(leader_state.progress_ms) - int(provider_state.progress_ms))


def _build_sync_state(
    target_state: SessionPlaybackTargetState,
    *,
    leader_state: ProviderPlaybackState | None,
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

    if target_state.is_leader:
        if provider_state.current_track is None:
            return SessionPlaybackSyncState.READY
        return SessionPlaybackSyncState.SYNCED

    if not provider_state.is_playing:
        return SessionPlaybackSyncState.PAUSED

    if leader_state is None or leader_state.current_track is None:
        return SessionPlaybackSyncState.READY

    if provider_state.current_track is None:
        return SessionPlaybackSyncState.WRONG_TRACK

    if provider_state.current_track.uri != leader_state.current_track.uri:
        return SessionPlaybackSyncState.WRONG_TRACK

    if not leader_state.is_playing:
        return SessionPlaybackSyncState.WRONG_POSITION

    progress_delta_ms = target_state.progress_delta_ms
    if (
        progress_delta_ms is not None
        and progress_delta_ms > SYNC_POSITION_TOLERANCE_MS
    ):
        return SessionPlaybackSyncState.WRONG_POSITION

    return SessionPlaybackSyncState.SYNCED


def _status_message(target_state: SessionPlaybackTargetState):
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

    sync_state = target_state.sync_state
    if sync_state == SessionPlaybackSyncState.PAUSED:
        return "Playback is paused on this participant. They will rejoin when they resume."
    if sync_state == SessionPlaybackSyncState.WRONG_TRACK:
        return "Playing a different track and will be resynced to the room leader."
    if sync_state == SessionPlaybackSyncState.WRONG_POSITION:
        progress_delta_ms = target_state.progress_delta_ms
        if progress_delta_ms is None:
            return "Playing the room track but outside the allowed sync window."
        return (
            "Playing the room track but "
            f"{int(progress_delta_ms / 1000)}s away from the room leader."
        )
    if sync_state == SessionPlaybackSyncState.READY:
        if target_state.is_leader:
            return "Room leader is ready to start playback."
        return "Ready to follow room playback."
    if sync_state == SessionPlaybackSyncState.SYNCED:
        if target_state.is_leader:
            if provider_state.is_playing:
                return "Room leader defines playback for the room."
            return "Room leader is paused."
        return "Currently synced to the room leader."

    return "Room playback is temporarily unavailable."


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
    *,
    force_refresh_user_ids: set[int] | None = None,
):
    provider = get_playback_provider(settings.playback_backend)
    participants = await list_session_participants(session)
    target_states: list[SessionPlaybackTargetState] = []
    force_refresh_user_ids = force_refresh_user_ids or set()

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
                force_refresh=user.id in force_refresh_user_ids,
            )
        except SpotifyException as exc:
            target_state.error_detail = str(exc.detail)

        target_states.append(target_state)

    leader_target = _leader_target(target_states)
    leader_state = leader_target.provider_state if leader_target else None

    for target_state in target_states:
        target_state.is_leader = (
            leader_target is not None and target_state.user.id == leader_target.user.id
        )
        target_state.progress_delta_ms = _progress_delta_ms(leader_state, target_state)
        target_state.sync_state = _build_sync_state(
            target_state,
            leader_state=leader_state,
        )

    return target_states


async def _sync_target_to_leader(
    session: GroupSession,
    settings: GroupSessionSettings,
    *,
    leader_target: SessionPlaybackTargetState,
    target_state: SessionPlaybackTargetState,
):
    leader_state = leader_target.provider_state
    target_provider_state = target_state.provider_state
    if (
        leader_state is None
        or leader_state.current_track is None
        or target_provider_state is None
    ):
        return False

    correction_key = _target_key(session.id, target_state.user.id)
    now = _utc_now()
    last_correction = _LAST_TARGET_CORRECTIONS.get(correction_key)
    if last_correction and (now - last_correction) < SYNC_CORRECTION_COOLDOWN:
        return False

    provider = get_playback_provider(settings.playback_backend)
    device_id = target_provider_state.device_id
    leader_track = leader_state.current_track
    leader_progress_ms = max(int(leader_state.progress_ms or 0), 0)
    same_track = (
        target_provider_state.current_track is not None
        and target_provider_state.current_track.uri == leader_track.uri
    )
    corrected = False

    async with _target_sync_lock(session.id, target_state.user.id):
        now = _utc_now()
        last_correction = _LAST_TARGET_CORRECTIONS.get(correction_key)
        if last_correction and (now - last_correction) < SYNC_CORRECTION_COOLDOWN:
            return False

        if same_track:
            if (
                target_state.progress_delta_ms is not None
                and target_state.progress_delta_ms > SYNC_POSITION_TOLERANCE_MS
            ):
                await provider.seek(
                    target_state.user,
                    leader_progress_ms,
                    device_id=device_id,
                )
                corrected = True

            if not leader_state.is_playing and target_provider_state.is_playing:
                await provider.pause(
                    target_state.user,
                    device_id=device_id,
                )
                corrected = True
        else:
            try:
                await provider.play_at_position(
                    target_state.user,
                    context_uri=leader_state.context_uri,
                    offset_track_uri=leader_track.uri if leader_state.context_uri else None,
                    track_uri=None if leader_state.context_uri else leader_track.uri,
                    position_ms=leader_progress_ms,
                    device_id=device_id,
                )
            except SpotifyException:
                await provider.play_at_position(
                    target_state.user,
                    track_uri=leader_track.uri,
                    position_ms=leader_progress_ms,
                    device_id=device_id,
                )
            corrected = True

            if not leader_state.is_playing:
                await provider.pause(
                    target_state.user,
                    device_id=device_id,
                )

        if corrected:
            _LAST_TARGET_CORRECTIONS[correction_key] = _utc_now()

    return corrected


async def reconcile_session_playback_target_states(
    session: GroupSession,
    settings: GroupSessionSettings,
):
    target_states = await collect_session_playback_target_states(session, settings)
    leader_target = _leader_target(target_states)
    if (
        leader_target is None
        or leader_target.provider_state is None
        or leader_target.provider_state.current_track is None
    ):
        return target_states

    corrected_user_ids: set[int] = set()
    for target_state in target_states:
        if not target_state.following_room:
            continue

        if target_state.sync_state not in {
            SessionPlaybackSyncState.WRONG_TRACK,
            SessionPlaybackSyncState.WRONG_POSITION,
        }:
            continue

        try:
            corrected = await _sync_target_to_leader(
                session,
                settings,
                leader_target=leader_target,
                target_state=target_state,
            )
        except SpotifyException as exc:
            target_state.error_detail = str(exc.detail)
            continue

        if corrected:
            corrected_user_ids.add(target_state.user.id)

    if not corrected_user_ids:
        return target_states

    provider = get_playback_provider(settings.playback_backend)
    corrected_users = [
        target_state.user
        for target_state in target_states
        if target_state.user.id in corrected_user_ids
    ]
    await invalidate_many_cached_playback_states(provider, corrected_users)
    return await collect_session_playback_target_states(
        session,
        settings,
        force_refresh_user_ids=corrected_user_ids,
    )


def build_member_sync_status_response(target_state: SessionPlaybackTargetState):
    provider_state = target_state.provider_state
    return SessionPlaybackTargetStatusResponse(
        user_id=target_state.user.id,
        display_name=target_state.user.display_name,
        auth_mode=target_state.user.auth_mode.value,
        is_host=target_state.is_host,
        is_leader=target_state.is_leader,
        eligible_for_everyone_playback=target_state.eligible_for_everyone_playback,
        device_available=provider_state.device_available if provider_state else False,
        device_is_restricted=provider_state.device_is_restricted if provider_state else False,
        is_playing=provider_state.is_playing if provider_state else False,
        following_room=target_state.following_room,
        progress_delta_ms=target_state.progress_delta_ms,
        sync_state=target_state.sync_state or SessionPlaybackSyncState.PLAYBACK_ERROR,
        status_message=_status_message(target_state),
    )


def build_everyone_playback_status_response(
    member_sync_status: list[SessionPlaybackTargetStatusResponse],
):
    eligible_members = [
        member for member in member_sync_status if member.eligible_for_everyone_playback
    ]
    leader_member = next((member for member in eligible_members if member.is_leader), None)
    leader_ready = bool(
        leader_member
        and leader_member.sync_state
        in {
            SessionPlaybackSyncState.SYNCED,
            SessionPlaybackSyncState.READY,
        }
    )
    ready_members = [
        member
        for member in eligible_members
        if (member.is_leader and leader_ready) or member.following_room
    ]
    unsynced_members = [
        member
        for member in eligible_members
        if member.sync_state
        not in {
            SessionPlaybackSyncState.SYNCED,
            SessionPlaybackSyncState.READY,
        }
    ]

    if not eligible_members:
        status_message = (
            "No joined Spotify members are currently eligible for Everyone playback."
        )
    elif not ready_members:
        status_message = (
            "No joined Spotify members are currently following room playback."
        )
    elif not unsynced_members:
        status_message = (
            "Everyone playback is synchronized across all joined Spotify members."
        )
    else:
        status_message = (
            f"Everyone playback is active for {len(ready_members)} joined Spotify members. "
            f"{len(unsynced_members)} still need attention."
        )

    return EveryonePlaybackStatusResponse(
        ready_member_count=len(ready_members),
        unsynced_member_count=len(unsynced_members),
        eligible_member_count=len(eligible_members),
        can_start_everyone_playback=leader_ready,
        status_message=status_message,
    )
