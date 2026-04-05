import asyncio
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone
from typing import Iterable

from playback.base import PlaybackProvider, ProviderPlaybackState

PLAYBACK_STATE_FRESHNESS_WINDOW = timedelta(seconds=4.5)


@dataclass
class CachedPlaybackState:
    state: ProviderPlaybackState
    fetched_at: datetime


_PLAYBACK_STATE_CACHE: dict[str, CachedPlaybackState] = {}
_PLAYBACK_STATE_IN_FLIGHT: dict[str, asyncio.Task[ProviderPlaybackState]] = {}
_PLAYBACK_STATE_LOCK = asyncio.Lock()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_observed_at(observed_at: datetime | None) -> datetime:
    if observed_at is None:
        return _utc_now()

    if observed_at.tzinfo is None:
        return observed_at.replace(tzinfo=timezone.utc)

    return observed_at.astimezone(timezone.utc)


def _cache_key(provider: PlaybackProvider, user) -> str:
    user_id = getattr(user, "id", "anonymous")
    return f"{provider.backend}:{user_id}"


def _advance_progress(
    state: ProviderPlaybackState,
    fetched_at: datetime,
) -> ProviderPlaybackState:
    now = _utc_now()
    progress_ms = state.progress_ms

    if progress_ms is not None and state.is_playing:
        elapsed_ms = max(int((now - fetched_at).total_seconds() * 1000), 0)
        progress_ms += elapsed_ms

        duration_ms = state.current_track.duration_ms if state.current_track else None
        if duration_ms is not None:
            progress_ms = min(progress_ms, duration_ms)

    return replace(
        state,
        progress_ms=progress_ms,
        observed_at=now,
    )


def _is_fresh(entry: CachedPlaybackState) -> bool:
    return (_utc_now() - entry.fetched_at) <= PLAYBACK_STATE_FRESHNESS_WINDOW


async def get_cached_playback_state(
    provider: PlaybackProvider,
    user,
    *,
    force_refresh: bool = False,
) -> ProviderPlaybackState:
    key = _cache_key(provider, user)

    async with _PLAYBACK_STATE_LOCK:
        cached_state = _PLAYBACK_STATE_CACHE.get(key)
        if not force_refresh and cached_state and _is_fresh(cached_state):
            return _advance_progress(cached_state.state, cached_state.fetched_at)

        in_flight = _PLAYBACK_STATE_IN_FLIGHT.get(key)
        if in_flight is None or in_flight.done():
            in_flight = asyncio.create_task(provider.fetch_state(user))
            _PLAYBACK_STATE_IN_FLIGHT[key] = in_flight

    try:
        state = await in_flight
    except Exception:
        async with _PLAYBACK_STATE_LOCK:
            if _PLAYBACK_STATE_IN_FLIGHT.get(key) is in_flight:
                _PLAYBACK_STATE_IN_FLIGHT.pop(key, None)
        raise

    observed_at = _normalize_observed_at(state.observed_at)
    normalized_state = replace(state, observed_at=observed_at)

    async with _PLAYBACK_STATE_LOCK:
        _PLAYBACK_STATE_CACHE[key] = CachedPlaybackState(
            state=normalized_state,
            fetched_at=observed_at,
        )
        if _PLAYBACK_STATE_IN_FLIGHT.get(key) is in_flight:
            _PLAYBACK_STATE_IN_FLIGHT.pop(key, None)

    return _advance_progress(normalized_state, observed_at)


async def invalidate_cached_playback_state(provider: PlaybackProvider, user) -> None:
    key = _cache_key(provider, user)
    async with _PLAYBACK_STATE_LOCK:
        _PLAYBACK_STATE_CACHE.pop(key, None)


async def invalidate_many_cached_playback_states(
    provider: PlaybackProvider,
    users: Iterable,
) -> None:
    async with _PLAYBACK_STATE_LOCK:
        for user in users:
            _PLAYBACK_STATE_CACHE.pop(_cache_key(provider, user), None)
