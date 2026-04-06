import asyncio
from collections import Counter
from datetime import datetime, timedelta
from http import HTTPStatus

from fastapi import HTTPException

from playback import get_playback_provider
from playback.base import ProviderPlaybackState
from playback.state_cache import (
    get_cached_playback_state,
    invalidate_cached_playback_state,
    invalidate_many_cached_playback_states,
)
from spotify_connector.models import SpotifyAlbum, SpotifyArtist, SpotifyTrack
from spotify_connector.spotify import SpotifyConnector
from session.models import (
    GroupSession,
    PlaybackBackend,
    QueueCapabilitiesResponse,
    QueueItemResponse,
    QueueItemStatus,
    QueuePlaybackStatusResponse,
    QueueTrackProjectionResponse,
    QueueTrackRequest,
    SessionQueueItem,
    SessionQueueProjectionResponse,
    SessionType,
)
from session.playback_sync import (
    SessionPlaybackTargetState,
    collect_session_playback_target_states,
    reconcile_session_playback_target_states,
)
from session.settings_service import ensure_session_settings

_SESSION_LOCKS: dict[int, asyncio.Lock] = {}


def _session_lock(session_id: int) -> asyncio.Lock:
    if session_id not in _SESSION_LOCKS:
        _SESSION_LOCKS[session_id] = asyncio.Lock()
    return _SESSION_LOCKS[session_id]


def _now_matching(reference: datetime | None = None):
    if reference is not None and reference.tzinfo is not None:
        return datetime.now(reference.tzinfo)

    return datetime.utcnow()


def request_track_to_spotify_track(track: QueueTrackRequest):
    album_images = []
    if track.album:
        album_images = [image.model_dump() for image in track.album.images]

    return SpotifyTrack(
        id=track.id,
        uri=track.uri,
        name=track.name,
        duration_ms=track.duration_ms,
        explicit=track.explicit,
        artists=[SpotifyArtist(**artist.model_dump()) for artist in track.artists],
        album=SpotifyAlbum(images=album_images) if album_images else None,
    )


def queue_item_to_spotify_track(item: SessionQueueItem):
    return SpotifyTrack(
        id=item.spotify_track_id,
        uri=item.spotify_track_uri,
        name=item.name,
        duration_ms=item.duration_ms,
        artists=[SpotifyArtist(**artist) for artist in (item.artists_json or [])],
        album=SpotifyAlbum(images=[{"url": item.album_art_url}])
        if item.album_art_url
        else None,
    )


def queue_item_to_response(item: SessionQueueItem, *, is_owner: bool):
    return QueueItemResponse(
        id=item.id,
        status=item.status,
        provider_dispatch_state=item.provider_dispatch_state,
        submitted_by=getattr(item, "submitted_by_display_name", None),
        submitted_at=item.submitted_at,
        can_remove=is_owner
        and item.status
        in {
            QueueItemStatus.PENDING_SYNC,
            QueueItemStatus.SYNC_BLOCKED,
            QueueItemStatus.SYNC_FAILED,
        },
        can_play_now=is_owner and item.status != QueueItemStatus.PLAYING,
        track=queue_item_to_spotify_track(item),
    )


def build_track_projection(
    track: SpotifyTrack,
    *,
    source: str,
    queue_item_id: int | None = None,
):
    return QueueTrackProjectionResponse(
        source=source,
        queue_item_id=queue_item_id,
        track=track,
    )


async def _active_queue_items(session: GroupSession):
    items = (
        await SessionQueueItem.filter(session=session)
        .exclude(status__in=[QueueItemStatus.PLAYED, QueueItemStatus.REMOVED])
        .prefetch_related("submitted_by")
        .order_by("submitted_at", "id")
    )

    for item in items:
        submitted_by = getattr(item, "submitted_by", None)
        item.submitted_by_display_name = (
            submitted_by.display_name if submitted_by is not None else None
        )
    return items


async def _persist_queue_item(
    session: GroupSession,
    submitted_by,
    track: QueueTrackRequest,
    *,
    status: QueueItemStatus = QueueItemStatus.PENDING_SYNC,
    provider_dispatch_state: str = "pending",
):
    album_art_url = None
    if track.album and track.album.images:
        album_art_url = track.album.images[0].url

    return await SessionQueueItem.create(
        session=session,
        submitted_by=submitted_by,
        spotify_track_id=track.id,
        spotify_track_uri=track.uri,
        name=track.name,
        artists_json=[artist.model_dump() for artist in track.artists],
        album_art_url=album_art_url,
        duration_ms=track.duration_ms,
        status=status,
        provider_dispatch_state=provider_dispatch_state,
    )


async def _fetch_track_detail(track_id: str | None):
    if not track_id:
        return None

    async with await SpotifyConnector.create() as spotify_connector:
        return await spotify_connector.get_track(track_id)


async def _track_request_is_explicit(track: QueueTrackRequest):
    if track.explicit is not None:
        return bool(track.explicit)

    if not track.id:
        return False

    track_detail = await _fetch_track_detail(track.id)
    return bool(track_detail and track_detail.explicit)


async def _queue_item_is_explicit(item: SessionQueueItem):
    if not item.spotify_track_id:
        return False

    track_detail = await _fetch_track_detail(item.spotify_track_id)
    return bool(track_detail and track_detail.explicit)


async def _ensure_track_allowed(session: GroupSession, track: QueueTrackRequest):
    settings = await ensure_session_settings(session)
    if not settings.explicit_filter:
        return

    if not await _track_request_is_explicit(track):
        return

    raise HTTPException(
        status_code=HTTPStatus.CONFLICT,
        detail="Explicit tracks are blocked in this session.",
    )


async def remove_blocked_explicit_queue_items(
    session: GroupSession,
    settings=None,
):
    settings = settings or await ensure_session_settings(session)
    if not settings.explicit_filter:
        return

    candidate_items = await SessionQueueItem.filter(
        session=session,
        status__in=[
            QueueItemStatus.PENDING_SYNC,
            QueueItemStatus.SYNC_BLOCKED,
            QueueItemStatus.SYNC_FAILED,
        ],
    ).order_by("submitted_at", "id")

    for item in candidate_items:
        if not await _queue_item_is_explicit(item):
            continue

        item.status = QueueItemStatus.REMOVED
        item.provider_dispatch_state = "removed_by_explicit_filter"
        item.removed_at = datetime.utcnow()
        await item.save(
            update_fields=["status", "provider_dispatch_state", "removed_at"]
        )


def _find_matching_current_item(items: list[SessionQueueItem], current_track: SpotifyTrack | None):
    if not current_track or not current_track.uri:
        return None

    for item in items:
        if (
            item.spotify_track_uri == current_track.uri
            and item.status in {QueueItemStatus.PLAYING, QueueItemStatus.SENT_TO_PROVIDER}
        ):
            return item

    return None


async def _mark_current_items_as_played(session: GroupSession, *, except_item_id: int | None = None):
    current_items = await SessionQueueItem.filter(
        session=session,
        status=QueueItemStatus.PLAYING,
    )
    for item in current_items:
        if except_item_id is not None and item.id == except_item_id:
            continue

        item.status = QueueItemStatus.PLAYED
        item.provider_dispatch_state = "played"
        item.played_at = datetime.utcnow()
        await item.save(update_fields=["status", "provider_dispatch_state", "played_at"])


def _dispatchable_item(items: list[SessionQueueItem]):
    for item in items:
        if item.status in {
            QueueItemStatus.PENDING_SYNC,
            QueueItemStatus.SYNC_BLOCKED,
            QueueItemStatus.SYNC_FAILED,
        }:
            return item
    return None


def _has_upcoming_provider_item(items: list[SessionQueueItem]):
    return any(item.status == QueueItemStatus.SENT_TO_PROVIDER for item in items)


async def _update_host_queue_item_statuses(
    session: GroupSession,
    provider_state: ProviderPlaybackState,
):
    now = _now_matching()
    items = await _active_queue_items(session)
    current_item = _find_matching_current_item(items, provider_state.current_track)

    for item in items:
        if item.status == QueueItemStatus.PLAYING and (
            current_item is None or current_item.id != item.id
        ):
            item.status = QueueItemStatus.PLAYED
            item.provider_dispatch_state = "played"
            item.played_at = now
            await item.save(update_fields=["status", "provider_dispatch_state", "played_at"])

    if current_item and current_item.status != QueueItemStatus.PLAYING:
        current_item.status = QueueItemStatus.PLAYING
        current_item.provider_dispatch_state = "playing"
        await current_item.save(update_fields=["status", "provider_dispatch_state"])

    observed_counts = Counter(
        track.uri for track in provider_state.observed_queue if track.uri
    )
    for item in items:
        if item.status != QueueItemStatus.SENT_TO_PROVIDER:
            continue

        if current_item and current_item.id == item.id:
            continue

        if item.spotify_track_uri and observed_counts[item.spotify_track_uri] > 0:
            observed_counts[item.spotify_track_uri] -= 1
            continue

        if item.sent_to_provider_at:
            stale_threshold = _now_matching(item.sent_to_provider_at) - timedelta(
                seconds=10
            )
        else:
            stale_threshold = None

        if stale_threshold and item.sent_to_provider_at < stale_threshold:
            item.status = QueueItemStatus.SYNC_FAILED
            item.provider_dispatch_state = "not_observed_in_provider_queue"
            item.last_error = "Track is no longer visible in the host Spotify queue."
            await item.save(
                update_fields=["status", "provider_dispatch_state", "last_error"]
            )


async def _dispatch_head_item_host_only(
    session: GroupSession,
    host_user,
    provider,
    provider_state: ProviderPlaybackState,
):
    items = await _active_queue_items(session)
    next_item = _dispatchable_item(items)
    if next_item is None:
        return False

    if provider_state.dispatch_block_reason:
        if next_item.status != QueueItemStatus.SYNC_BLOCKED or (
            next_item.provider_dispatch_state != provider_state.dispatch_block_reason
        ):
            next_item.status = QueueItemStatus.SYNC_BLOCKED
            next_item.provider_dispatch_state = provider_state.dispatch_block_reason
            await next_item.save(update_fields=["status", "provider_dispatch_state"])
        return False

    if _has_upcoming_provider_item(items):
        return False

    await provider.enqueue(
        host_user,
        next_item.spotify_track_uri,
        device_id=provider_state.device_id,
    )
    next_item.status = QueueItemStatus.SENT_TO_PROVIDER
    next_item.provider_dispatch_state = "queued_in_provider"
    next_item.last_error = None
    next_item.sent_to_provider_at = datetime.utcnow()
    await next_item.save(
        update_fields=[
            "status",
            "provider_dispatch_state",
            "last_error",
            "sent_to_provider_at",
        ]
    )
    return True


def _external_items_from_state(
    items: list[SessionQueueItem],
    provider_state: ProviderPlaybackState,
):
    queue_counts = Counter(
        item.spotify_track_uri
        for item in items
        if item.status == QueueItemStatus.SENT_TO_PROVIDER and item.spotify_track_uri
    )
    external_items = []
    for track in provider_state.observed_queue:
        if track.uri and queue_counts.get(track.uri, 0) > 0:
            queue_counts[track.uri] -= 1
            continue

        external_items.append(build_track_projection(track, source="spotify_external"))
    return external_items


def _current_track_projection_from_state(
    items: list[SessionQueueItem],
    provider_state: ProviderPlaybackState,
):
    if not provider_state.current_track:
        return None

    current_item = _find_matching_current_item(items, provider_state.current_track)
    if current_item is None:
        return build_track_projection(
            provider_state.current_track,
            source="spotify_external",
        )

    return build_track_projection(
        provider_state.current_track,
        source="queueify",
        queue_item_id=current_item.id,
    )


def _canonical_target_state(target_states: list[SessionPlaybackTargetState]):
    host_state = next((state for state in target_states if state.is_host), None)
    if host_state is not None:
        return host_state

    return next(
        (state for state in target_states if state.provider_state is not None),
        None,
    )


def _ready_everyone_targets(target_states: list[SessionPlaybackTargetState]):
    leader_target = _canonical_target_state(target_states)
    if leader_target is None or not leader_target.participates_in_room_playback:
        return []

    return [
        target_state
        for target_state in target_states
        if target_state.participates_in_room_playback
    ]


async def _update_everyone_queue_item_statuses(
    session: GroupSession,
    target_states: list[SessionPlaybackTargetState],
):
    current_item = await SessionQueueItem.get_or_none(
        session=session,
        status=QueueItemStatus.PLAYING,
    )
    if current_item is None:
        return False

    current_track_uri = current_item.spotify_track_uri
    if any(
        target_state.provider_state
        and target_state.provider_state.current_track
        and target_state.provider_state.current_track.uri == current_track_uri
        for target_state in target_states
        if target_state.participates_in_room_playback
    ):
        return False

    if not _ready_everyone_targets(target_states):
        return False

    canonical_target = _canonical_target_state(target_states)
    if (
        canonical_target
        and canonical_target.provider_state
        and canonical_target.provider_state.current_track
        and canonical_target.provider_state.current_track.uri != current_track_uri
    ):
        current_item.status = QueueItemStatus.PLAYED
        current_item.provider_dispatch_state = "interrupted_by_leader"
        current_item.played_at = datetime.utcnow()
        await current_item.save(
            update_fields=["status", "provider_dispatch_state", "played_at"]
        )
        return False

    current_item.status = QueueItemStatus.PLAYED
    current_item.provider_dispatch_state = "played"
    current_item.played_at = datetime.utcnow()
    await current_item.save(update_fields=["status", "provider_dispatch_state", "played_at"])
    return True


async def _dispatch_head_item_everyone(
    session: GroupSession,
    settings,
    target_states: list[SessionPlaybackTargetState],
    *,
    allow_autoplay: bool,
):
    if not allow_autoplay:
        return False

    items = await _active_queue_items(session)
    next_item = _dispatchable_item(items)
    if next_item is None:
        return False

    await remove_blocked_explicit_queue_items(session, settings)
    items = await _active_queue_items(session)
    next_item = _dispatchable_item(items)
    if next_item is None:
        return False

    ready_targets = _ready_everyone_targets(target_states)
    if not ready_targets:
        if next_item.status != QueueItemStatus.SYNC_BLOCKED or (
            next_item.provider_dispatch_state != "no_ready_member_device"
        ):
            next_item.status = QueueItemStatus.SYNC_BLOCKED
            next_item.provider_dispatch_state = "no_ready_member_device"
            next_item.last_error = (
                "No joined Spotify member currently has a controllable device."
            )
            await next_item.save(
                update_fields=["status", "provider_dispatch_state", "last_error"]
            )
        return False

    provider = get_playback_provider(settings.playback_backend)
    dispatch_results = await asyncio.gather(
        *[
            provider.play_now(
                target_state.user,
                next_item.spotify_track_uri,
                device_id=target_state.provider_state.device_id
                if target_state.provider_state
                else None,
            )
            for target_state in ready_targets
        ],
        return_exceptions=True,
    )
    successful_dispatches = [
        result for result in dispatch_results if not isinstance(result, Exception)
    ]
    if not successful_dispatches:
        next_item.status = QueueItemStatus.SYNC_FAILED
        next_item.provider_dispatch_state = "everyone_dispatch_failed"
        next_item.last_error = (
            "Could not start playback on any joined Spotify device."
        )
        await next_item.save(
            update_fields=["status", "provider_dispatch_state", "last_error"]
        )
        return False

    await _mark_current_items_as_played(session, except_item_id=next_item.id)
    next_item.status = QueueItemStatus.PLAYING
    next_item.provider_dispatch_state = "playing"
    next_item.sent_to_provider_at = datetime.utcnow()
    next_item.last_error = None
    await next_item.save(
        update_fields=[
            "status",
            "provider_dispatch_state",
            "sent_to_provider_at",
            "last_error",
        ]
    )
    await invalidate_many_cached_playback_states(
        provider,
        [target_state.user for target_state in ready_targets],
    )
    return True


def _build_capabilities(*, is_owner: bool, provider_state: ProviderPlaybackState):
    return QueueCapabilitiesResponse(
        can_add_to_queue=True,
        can_play_now=is_owner
        and provider_state.device_available
        and not provider_state.device_is_restricted,
        can_remove_queued_items=is_owner,
        can_control_playback=is_owner,
    )


def _build_playback_status(provider_state: ProviderPlaybackState):
    return QueuePlaybackStatusResponse(
        backend=PlaybackBackend(provider_state.backend),
        device_id=provider_state.device_id,
        device_name=provider_state.device_name,
        device_available=provider_state.device_available,
        device_is_restricted=provider_state.device_is_restricted,
        is_playing=provider_state.is_playing,
        context_uri=provider_state.context_uri,
        progress_ms=provider_state.progress_ms,
        dispatch_block_reason=provider_state.dispatch_block_reason,
    )


def _build_everyone_playback_status(target_states: list[SessionPlaybackTargetState]):
    canonical_target = _canonical_target_state(target_states)
    canonical_state = canonical_target.provider_state if canonical_target else None
    room_ready = bool(_ready_everyone_targets(target_states))

    return QueuePlaybackStatusResponse(
        backend=PlaybackBackend.SPOTIFY_HOST,
        device_id=canonical_state.device_id if canonical_state else None,
        device_name=canonical_state.device_name if canonical_state else None,
        device_available=bool(canonical_state.device_available if canonical_state else False),
        device_is_restricted=bool(
            canonical_state.device_is_restricted if canonical_state else False
        ),
        is_playing=bool(canonical_state.is_playing if canonical_state else False),
        context_uri=canonical_state.context_uri if canonical_state else None,
        progress_ms=canonical_state.progress_ms if canonical_state else None,
        dispatch_block_reason=None if room_ready else "no_ready_member_device",
    )


def _external_items_from_everyone(target_states: list[SessionPlaybackTargetState]):
    host_target = next((target_state for target_state in target_states if target_state.is_host), None)
    if host_target is None or host_target.provider_state is None:
        return []

    return [
        build_track_projection(track, source="spotify_external")
        for track in host_target.provider_state.observed_queue
    ]


def _current_track_projection_everyone(
    room_playing_item: SessionQueueItem | None,
    target_states: list[SessionPlaybackTargetState],
):
    if room_playing_item is not None:
        return build_track_projection(
            queue_item_to_spotify_track(room_playing_item),
            source="queueify",
            queue_item_id=room_playing_item.id,
        )

    canonical_target = _canonical_target_state(target_states)
    if canonical_target and canonical_target.provider_state and canonical_target.provider_state.current_track:
        return build_track_projection(
            canonical_target.provider_state.current_track,
            source="spotify_external",
        )

    return None


async def _host_only_queue_projection(session: GroupSession, viewer, settings):
    provider = get_playback_provider(settings.playback_backend)
    host_user = await session.owner

    async with _session_lock(session.id):
        await remove_blocked_explicit_queue_items(session, settings)
        provider_state = await get_cached_playback_state(provider, host_user)
        await _update_host_queue_item_statuses(session, provider_state)
        if await _dispatch_head_item_host_only(session, host_user, provider, provider_state):
            await invalidate_cached_playback_state(provider, host_user)
            provider_state = await get_cached_playback_state(
                provider,
                host_user,
                force_refresh=True,
            )
            await _update_host_queue_item_statuses(session, provider_state)

        items = await _active_queue_items(session)

    return SessionQueueProjectionResponse(
        now_playing=_current_track_projection_from_state(items, provider_state),
        playback_status=_build_playback_status(provider_state),
        capabilities=_build_capabilities(
            is_owner=session.owner_id == viewer.id,
            provider_state=provider_state,
        ),
        queue_items=[
            queue_item_to_response(item, is_owner=session.owner_id == viewer.id)
            for item in items
            if item.status != QueueItemStatus.PLAYING
        ],
        external_items=_external_items_from_state(items, provider_state),
    )


async def _everyone_queue_projection(session: GroupSession, viewer, settings):
    async with _session_lock(session.id):
        await remove_blocked_explicit_queue_items(session, settings)
        target_states = await reconcile_session_playback_target_states(
            session,
            settings,
        )
        room_track_completed = await _update_everyone_queue_item_statuses(
            session,
            target_states,
        )
        if await _dispatch_head_item_everyone(
            session,
            settings,
            target_states,
            allow_autoplay=room_track_completed,
        ):
            target_states = await reconcile_session_playback_target_states(
                session,
                settings,
            )
            await _update_everyone_queue_item_statuses(session, target_states)

        items = await _active_queue_items(session)
        room_playing_item = await SessionQueueItem.get_or_none(
            session=session,
            status=QueueItemStatus.PLAYING,
        )

    playback_status = _build_everyone_playback_status(target_states)
    return SessionQueueProjectionResponse(
        now_playing=_current_track_projection_everyone(room_playing_item, target_states),
        playback_status=playback_status,
        capabilities=_build_capabilities(
            is_owner=session.owner_id == viewer.id,
            provider_state=ProviderPlaybackState(
                backend=PlaybackBackend.SPOTIFY_HOST.value,
                device_available=playback_status.device_available,
                device_is_restricted=playback_status.device_is_restricted,
                is_playing=playback_status.is_playing,
            ),
        ),
        queue_items=[
            queue_item_to_response(item, is_owner=session.owner_id == viewer.id)
            for item in items
            if item.status != QueueItemStatus.PLAYING
        ],
        external_items=_external_items_from_everyone(target_states),
    )


async def get_queue_projection(session: GroupSession, viewer):
    settings = await ensure_session_settings(session)
    if settings.session_type == SessionType.EVERYONE:
        return await _everyone_queue_projection(session, viewer, settings)

    return await _host_only_queue_projection(session, viewer, settings)


async def add_track_to_queue(session: GroupSession, submitted_by, track: QueueTrackRequest):
    await _ensure_track_allowed(session, track)
    await _persist_queue_item(session, submitted_by, track)
    return await get_queue_projection(session, submitted_by)


async def _ensure_host_play_now_allowed(session: GroupSession, settings):
    if settings.session_type == SessionType.EVERYONE:
        target_states = await collect_session_playback_target_states(session, settings)
        if _ready_everyone_targets(target_states):
            return target_states

        raise HTTPException(
            status_code=HTTPStatus.CONFLICT,
            detail="No joined Spotify member currently has a controllable device.",
        )

    provider = get_playback_provider(settings.playback_backend)
    host_user = await session.owner
    provider_state = await get_cached_playback_state(provider, host_user)
    if not provider_state.device_available or provider_state.device_is_restricted:
        raise HTTPException(
            status_code=HTTPStatus.CONFLICT,
            detail="The host does not currently have a controllable Spotify device.",
        )

    return provider_state


def _transport_control_detail(
    *,
    control_name: str,
    everyone: bool,
    missing_current_track: bool = False,
):
    if missing_current_track:
        if everyone:
            return "Playback is not currently active on any joined Spotify device."
        return "Playback is not currently active on the host device."

    if everyone:
        return "No joined Spotify member currently has a controllable device."
    return "The host does not currently have a controllable Spotify device."


async def _ensure_host_transport_control_allowed(
    session: GroupSession,
    settings,
    *,
    control_name: str,
    require_current_track: bool = True,
):
    provider = get_playback_provider(settings.playback_backend)
    host_user = await session.owner
    provider_state = await get_cached_playback_state(provider, host_user)

    if not provider_state.device_available or provider_state.device_is_restricted:
        raise HTTPException(
            status_code=HTTPStatus.CONFLICT,
            detail=_transport_control_detail(
                control_name=control_name,
                everyone=False,
            ),
        )

    if require_current_track and provider_state.current_track is None:
        raise HTTPException(
            status_code=HTTPStatus.CONFLICT,
            detail=_transport_control_detail(
                control_name=control_name,
                everyone=False,
                missing_current_track=True,
            ),
        )

    return provider_state


def _controllable_everyone_targets(
    target_states: list[SessionPlaybackTargetState],
    *,
    require_current_track: bool = True,
):
    ready_targets = _ready_everyone_targets(target_states)
    if not require_current_track:
        return ready_targets

    return [
        target_state
        for target_state in ready_targets
        if target_state.provider_state and target_state.provider_state.current_track
    ]


async def _perform_transport_control_everyone(
    session: GroupSession,
    settings,
    *,
    control_name: str,
    provider_method_name: str,
    require_current_track: bool = True,
):
    provider = get_playback_provider(settings.playback_backend)
    target_states = await reconcile_session_playback_target_states(
        session,
        settings,
    )
    ready_targets = _ready_everyone_targets(target_states)
    if not ready_targets:
        raise HTTPException(
            status_code=HTTPStatus.CONFLICT,
            detail=_transport_control_detail(
                control_name=control_name,
                everyone=True,
            ),
        )

    control_targets = _controllable_everyone_targets(
        ready_targets,
        require_current_track=require_current_track,
    )
    if not control_targets:
        raise HTTPException(
            status_code=HTTPStatus.CONFLICT,
            detail=_transport_control_detail(
                control_name=control_name,
                everyone=True,
                missing_current_track=True,
            ),
        )

    control_method = getattr(provider, provider_method_name)
    dispatch_results = await asyncio.gather(
        *[
            control_method(
                target_state.user,
                device_id=target_state.provider_state.device_id
                if target_state.provider_state
                else None,
            )
            for target_state in control_targets
        ],
        return_exceptions=True,
    )
    if not any(not isinstance(result, Exception) for result in dispatch_results):
        raise HTTPException(
            status_code=HTTPStatus.CONFLICT,
            detail="Could not control playback on any joined Spotify device.",
        )

    await invalidate_many_cached_playback_states(
        provider,
        [target_state.user for target_state in control_targets],
    )


async def _perform_transport_control(
    session: GroupSession,
    submitted_by,
    *,
    control_name: str,
    provider_method_name: str,
    require_current_track: bool = True,
):
    if session.owner_id != submitted_by.id:
        raise HTTPException(
            status_code=HTTPStatus.FORBIDDEN,
            detail="Only the host can control playback.",
        )

    settings = await ensure_session_settings(session)

    async with _session_lock(session.id):
        if settings.session_type == SessionType.EVERYONE:
            await _perform_transport_control_everyone(
                session,
                settings,
                control_name=control_name,
                provider_method_name=provider_method_name,
                require_current_track=require_current_track,
            )
        else:
            provider_state = await _ensure_host_transport_control_allowed(
                session,
                settings,
                control_name=control_name,
                require_current_track=require_current_track,
            )
            provider = get_playback_provider(settings.playback_backend)
            host_user = await session.owner
            await getattr(provider, provider_method_name)(
                host_user,
                device_id=provider_state.device_id,
            )
            await invalidate_cached_playback_state(provider, host_user)

    return await get_queue_projection(session, submitted_by)


async def play_track_now(session: GroupSession, submitted_by, track: QueueTrackRequest):
    if session.owner_id != submitted_by.id:
        raise HTTPException(
            status_code=HTTPStatus.FORBIDDEN,
            detail="Only the host can start playback immediately.",
        )

    await _ensure_track_allowed(session, track)
    settings = await ensure_session_settings(session)

    async with _session_lock(session.id):
        if settings.session_type == SessionType.EVERYONE:
            target_states = await _ensure_host_play_now_allowed(session, settings)
            provider = get_playback_provider(settings.playback_backend)
            ready_targets = _ready_everyone_targets(target_states)
            dispatch_results = await asyncio.gather(
                *[
                    provider.play_now(
                        target_state.user,
                        track.uri,
                        device_id=target_state.provider_state.device_id
                        if target_state.provider_state
                        else None,
                    )
                    for target_state in ready_targets
                ],
                return_exceptions=True,
            )
            if not any(not isinstance(result, Exception) for result in dispatch_results):
                raise HTTPException(
                    status_code=HTTPStatus.CONFLICT,
                    detail="Could not start playback on any joined Spotify device.",
                )
            await invalidate_many_cached_playback_states(
                provider,
                [target_state.user for target_state in ready_targets],
            )
        else:
            provider_state = await _ensure_host_play_now_allowed(session, settings)
            provider = get_playback_provider(settings.playback_backend)
            host_user = await session.owner
            await provider.play_now(
                host_user,
                track.uri,
                device_id=provider_state.device_id,
            )
            await invalidate_cached_playback_state(provider, host_user)

        await _mark_current_items_as_played(session)

        new_item = await _persist_queue_item(
            session,
            submitted_by,
            track,
            status=QueueItemStatus.PLAYING,
            provider_dispatch_state="playing",
        )
        new_item.sent_to_provider_at = datetime.utcnow()
        await new_item.save(update_fields=["sent_to_provider_at"])

    return await get_queue_projection(session, submitted_by)


async def play_queue_item_now(session: GroupSession, submitted_by, item_id: int):
    if session.owner_id != submitted_by.id:
        raise HTTPException(
            status_code=HTTPStatus.FORBIDDEN,
            detail="Only the host can start playback immediately.",
        )

    item = await SessionQueueItem.get_or_none(id=item_id, session=session)
    if item is None or item.status == QueueItemStatus.REMOVED:
        raise HTTPException(
            status_code=HTTPStatus.NOT_FOUND,
            detail="Queue item not found.",
        )

    settings = await ensure_session_settings(session)
    if settings.explicit_filter and await _queue_item_is_explicit(item):
        raise HTTPException(
            status_code=HTTPStatus.CONFLICT,
            detail="Explicit tracks are blocked in this session.",
        )

    async with _session_lock(session.id):
        if settings.session_type == SessionType.EVERYONE:
            target_states = await _ensure_host_play_now_allowed(session, settings)
            provider = get_playback_provider(settings.playback_backend)
            ready_targets = _ready_everyone_targets(target_states)
            dispatch_results = await asyncio.gather(
                *[
                    provider.play_now(
                        target_state.user,
                        item.spotify_track_uri,
                        device_id=target_state.provider_state.device_id
                        if target_state.provider_state
                        else None,
                    )
                    for target_state in ready_targets
                ],
                return_exceptions=True,
            )
            if not any(not isinstance(result, Exception) for result in dispatch_results):
                raise HTTPException(
                    status_code=HTTPStatus.CONFLICT,
                    detail="Could not start playback on any joined Spotify device.",
                )
            await invalidate_many_cached_playback_states(
                provider,
                [target_state.user for target_state in ready_targets],
            )
        else:
            provider_state = await _ensure_host_play_now_allowed(session, settings)
            provider = get_playback_provider(settings.playback_backend)
            host_user = await session.owner
            await provider.play_now(
                host_user,
                item.spotify_track_uri,
                device_id=provider_state.device_id,
            )
            await invalidate_cached_playback_state(provider, host_user)

        await _mark_current_items_as_played(session, except_item_id=item.id)

        item.status = QueueItemStatus.PLAYING
        item.provider_dispatch_state = "playing"
        item.sent_to_provider_at = item.sent_to_provider_at or datetime.utcnow()
        item.last_error = None
        await item.save(
            update_fields=[
                "status",
                "provider_dispatch_state",
                "sent_to_provider_at",
                "last_error",
            ]
        )

    return await get_queue_projection(session, submitted_by)


async def remove_queue_item(session: GroupSession, submitted_by, item_id: int):
    if session.owner_id != submitted_by.id:
        raise HTTPException(
            status_code=HTTPStatus.FORBIDDEN,
            detail="Only the host can remove queued tracks.",
        )

    item = await SessionQueueItem.get_or_none(id=item_id, session=session)
    if item is None or item.status == QueueItemStatus.REMOVED:
        raise HTTPException(
            status_code=HTTPStatus.NOT_FOUND,
            detail="Queue item not found.",
        )

    if item.status not in {
        QueueItemStatus.PENDING_SYNC,
        QueueItemStatus.SYNC_BLOCKED,
        QueueItemStatus.SYNC_FAILED,
    }:
        raise HTTPException(
            status_code=HTTPStatus.CONFLICT,
            detail="This track can no longer be removed because it has already been handed to Spotify.",
        )

    item.status = QueueItemStatus.REMOVED
    item.provider_dispatch_state = "removed"
    item.removed_at = datetime.utcnow()
    await item.save(update_fields=["status", "provider_dispatch_state", "removed_at"])
    return await get_queue_projection(session, submitted_by)


async def pause_playback(session: GroupSession, submitted_by):
    return await _perform_transport_control(
        session,
        submitted_by,
        control_name="pause",
        provider_method_name="pause",
    )


async def resume_playback(session: GroupSession, submitted_by):
    return await _perform_transport_control(
        session,
        submitted_by,
        control_name="resume",
        provider_method_name="resume",
    )


async def skip_to_next(session: GroupSession, submitted_by):
    return await _perform_transport_control(
        session,
        submitted_by,
        control_name="next",
        provider_method_name="skip_next",
    )


async def skip_to_previous(session: GroupSession, submitted_by):
    return await _perform_transport_control(
        session,
        submitted_by,
        control_name="previous",
        provider_method_name="skip_previous",
    )
