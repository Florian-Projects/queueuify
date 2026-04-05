from typing import List, Optional

from pydantic import BaseModel, Field


class UserDetailResponse(BaseModel):
    id: str
    display_name: Optional[str] = None


class SongSearchResponse(BaseModel):
    pass


class SpotifyExternalIds(BaseModel):
    isrc: Optional[str] = None


class SpotifyAlbum(BaseModel):
    href: Optional[str] = None
    id: Optional[str] = None
    images: List[dict] = Field(default_factory=list)
    name: Optional[str] = None
    uri: Optional[str] = None


class SpotifyArtist(BaseModel):
    name: str
    uri: str


class SpotifyTrack(BaseModel):
    album: Optional[SpotifyAlbum] = None
    artists: List[SpotifyArtist] = Field(default_factory=list)
    duration_ms: Optional[int] = None
    explicit: Optional[bool] = None
    external_urls: dict = Field(default_factory=dict)
    href: Optional[str] = None
    id: Optional[str] = None
    name: Optional[str] = None
    uri: Optional[str] = None


class SpotifyTrackList(BaseModel):
    items: List[SpotifyTrack] = Field(default_factory=list)


class SpotifyTrackResponse(BaseModel):
    tracks: Optional[SpotifyTrackList]


class SessionQueueResponse(BaseModel):
    currently_playing: Optional[SpotifyTrack] = None
    queue: List[SpotifyTrack] = Field(default_factory=list)


class SpotifyPlaybackDevice(BaseModel):
    id: Optional[str] = None
    is_active: bool = False
    is_restricted: bool = False
    name: Optional[str] = None
    type: Optional[str] = None
    volume_percent: Optional[int] = None


class SpotifyPlaybackContext(BaseModel):
    href: Optional[str] = None
    type: Optional[str] = None
    uri: Optional[str] = None


class SpotifyPlaybackStateResponse(BaseModel):
    device: Optional[SpotifyPlaybackDevice] = None
    repeat_state: Optional[str] = None
    shuffle_state: Optional[bool] = None
    context: Optional[SpotifyPlaybackContext] = None
    timestamp: Optional[int] = None
    progress_ms: Optional[int] = None
    is_playing: bool = False
    item: Optional[SpotifyTrack] = None


class SpotifyAvailableDevicesResponse(BaseModel):
    devices: List[SpotifyPlaybackDevice] = Field(default_factory=list)
