from typing import List, Optional

from pydantic import BaseModel


class UserDetailResponse(BaseModel):
    id: str
    display_name: str


class SongSearchResponse(BaseModel):
    pass


class SpotifyExternalIds(BaseModel):
    isrc: Optional[str] = None


class SpotifyAlbum(BaseModel):
    href: Optional[str] = None
    id: Optional[str] = None
    images: Optional[List[dict]] = []
    name: Optional[str] = None
    uri: Optional[str] = None


class SpotifyArtist(BaseModel):
    name: str
    uri: str


class SpotifyTrack(BaseModel):
    album: Optional[SpotifyAlbum] = None
    artists: List[SpotifyArtist] = []
    external_urls: Optional[dict] = {}
    href: Optional[str] = None
    id: Optional[str] = None
    name: Optional[str] = None
    uri: Optional[str] = None


class SpotifyTrackList(BaseModel):
    items: List[SpotifyTrack]


class SpotifyTrackResponse(BaseModel):
    tracks: Optional[SpotifyTrackList]


class SessionQueueResponse(BaseModel):
    currently_playing: SpotifyTrack
    queue: List[SpotifyTrack]
