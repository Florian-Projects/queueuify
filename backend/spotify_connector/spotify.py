import json
from http import HTTPStatus

import httpx

from spotify_connector.models import (
    UserDetailResponse,
    SongSearchResponse,
    SpotifyTrackResponse,
)


class SpotifyConnector:
    def __init__(self, access_token: str):
        self.client = httpx.AsyncClient(
            headers={"Authorization": f"Bearer {access_token}"},
            base_url="https://api.spotify.com/v1",
        )

    async def get_current_user_detail(self) -> UserDetailResponse:
        response = await self.client.get("/me")
        return UserDetailResponse(**response.json())

    async def add_song_to_queue(self, song_uri):
        response = await self.client.post("/me/player/queue", params={"uri": song_uri})

        if response.status_code == HTTPStatus.NO_CONTENT.value:
            return True
        else:
            return False

    async def search_song(self, song_name):
        response = await self.client.get(
            "/search", params={"q": f"track:{song_name}", "type": "track", "limit": 25}
        )
        return SpotifyTrackResponse(**response.json())
        return SongSearchResponse(**response.json())
