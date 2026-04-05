from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from spotify_connector.models import SpotifyTrack


@dataclass
class ProviderPlaybackState:
    backend: str
    device_id: Optional[str] = None
    device_name: Optional[str] = None
    device_available: bool = False
    device_is_restricted: bool = False
    is_playing: bool = False
    context_uri: Optional[str] = None
    progress_ms: Optional[int] = None
    observed_at: Optional[datetime] = None
    dispatch_block_reason: Optional[str] = None
    current_track: Optional[SpotifyTrack] = None
    observed_queue: list[SpotifyTrack] = field(default_factory=list)


class PlaybackProvider(ABC):
    backend: str

    @abstractmethod
    async def fetch_state(self, host_user):
        raise NotImplementedError

    @abstractmethod
    async def enqueue(self, host_user, track_uri: str, device_id: Optional[str] = None):
        raise NotImplementedError

    @abstractmethod
    async def play_now(self, host_user, track_uri: str, device_id: Optional[str] = None):
        raise NotImplementedError

    @abstractmethod
    async def pause(self, host_user, device_id: Optional[str] = None):
        raise NotImplementedError

    @abstractmethod
    async def resume(self, host_user, device_id: Optional[str] = None):
        raise NotImplementedError

    @abstractmethod
    async def skip_next(self, host_user, device_id: Optional[str] = None):
        raise NotImplementedError

    @abstractmethod
    async def skip_previous(self, host_user, device_id: Optional[str] = None):
        raise NotImplementedError
