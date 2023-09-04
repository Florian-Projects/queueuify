from http import HTTPStatus
from typing import Optional

import httpx
from fastapi.exceptions import HTTPException

import oauth.oauth
from models import User
from oauth.oauth import spotify_oauth
from spotify_connector.models import (
    UserDetailResponse,
    SpotifyTrack,
    SpotifyTrackResponse,
    SessionQueueResponse,
)


class SpotifyException(HTTPException):
    pass


class SpotifyConnector:
    def __init__(
        self, client: httpx.AsyncClient, user: Optional[User], access_token: str
    ):
        if client is None or access_token is None:
            raise Exception("Usse the create factory")

        self.client = client
        self.user = user
        self.access_token = access_token

    @classmethod
    async def create(
        cls, user: Optional[User] = None, access_token: Optional[str] = None
    ):
        user = user
        if access_token:
            access_token = access_token
        elif user:
            access_token = user.access_token
        else:
            access_token = await oauth.oauth.spotify_oauth.get_client_credentials()

        client = httpx.AsyncClient(
            headers={"Authorization": f"Bearer {access_token}"},
            base_url="https://api.spotify.com/v1",
        )
        return cls(client, user, access_token)

    async def _refresh_authentication(self):
        if self.user:
            access_token, refresh_token = await spotify_oauth.refresh_access_token(
                self.user.refresh_token
            )
            self.user.access_token = access_token
            if refresh_token:
                self.user.refresh_token = refresh_token
                await self.user.save(update_fields=["access_token", "refresh_token"])
            else:
                await self.user.save(update_fields=["access_token"])

        else:
            self.access_token = spotify_oauth.get_authorization_url()
        self.access_token = access_token
        self.client.headers["Authorization"] = f"Bearer {self.access_token}"

    async def send_reqeust(
        self,
        *args,
        already_tried=False,
        **kwargs,
    ):
        response = await self.client.request(*args, **kwargs)
        if response.status_code == HTTPStatus.UNAUTHORIZED.value:
            await self._refresh_authentication()
            # retry only once with the new token
            if not already_tried:
                return await self.send_reqeust(*args, **kwargs, already_tried=True)

        if response.status_code >= 300:
            raise SpotifyException(
                status_code=response.status_code, detail=response.json()
            )

        return response

    async def get_current_user_detail(self) -> UserDetailResponse:
        response = await self.client.get("/me")
        return UserDetailResponse(**response.json())

    async def add_song_to_queue(self, song_uri):
        _ = await self.send_reqeust(
            method="post", url="/me/player/queue", params={"uri": song_uri}
        )

        return True

    async def search_song(self, song_name) -> SpotifyTrackResponse:
        response = await self.send_reqeust(
            method="get",
            url="/search",
            params={"q": f"track:{song_name}", "type": "track", "limit": 25},
        )
        return SpotifyTrackResponse(**response.json())

    async def get_current_queue(self):
        response = await self.send_reqeust(method="get", url="/me/player/queue")
        data = {
            "currently_playing": SpotifyTrack(
                **response.json()["currently_playing"]
            ).model_dump(),
            "queue": [
                SpotifyTrack(**item).model_dump() for item in response.json()["queue"]
            ],
        }
        return SessionQueueResponse(**data)
