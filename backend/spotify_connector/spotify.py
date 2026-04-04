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
    timeout = httpx.Timeout(15.0, connect=5.0)

    def __init__(
        self, client: httpx.AsyncClient, user: Optional[User], access_token: str
    ):
        if client is None or access_token is None:
            raise Exception("Use the create factory")

        self.client = client
        self.user = user
        self.access_token = access_token

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.client.aclose()

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
            timeout=cls.timeout,
        )
        return cls(client, user, access_token)

    @staticmethod
    def _extract_error_detail(response: httpx.Response):
        try:
            data = response.json()
        except ValueError:
            return response.text or response.reason_phrase

        if isinstance(data, dict):
            if isinstance(data.get("error"), dict) and data["error"].get("message"):
                return data["error"]["message"]
            if data.get("error"):
                return data["error"]

        return data

    async def _refresh_authentication(self):
        if self.user:
            if not self.user.refresh_token:
                raise SpotifyException(
                    status_code=HTTPStatus.UNAUTHORIZED,
                    detail="Spotify session expired. Please sign in again.",
                )

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
            access_token = await spotify_oauth.get_client_credentials()

        self.access_token = access_token
        self.client.headers["Authorization"] = f"Bearer {self.access_token}"

    async def send_request(
        self,
        *args,
        already_tried=False,
        **kwargs,
    ):
        try:
            response = await self.client.request(*args, **kwargs)
        except httpx.TimeoutException as exc:
            raise SpotifyException(
                status_code=HTTPStatus.GATEWAY_TIMEOUT,
                detail="Spotify request timed out.",
            ) from exc
        except httpx.RequestError as exc:
            raise SpotifyException(
                status_code=HTTPStatus.BAD_GATEWAY,
                detail=f"Spotify request failed: {exc}",
            ) from exc

        if response.status_code == HTTPStatus.UNAUTHORIZED.value:
            await self._refresh_authentication()
            # retry only once with the new token
            if not already_tried:
                return await self.send_request(*args, **kwargs, already_tried=True)

        if response.status_code >= 300:
            raise SpotifyException(
                status_code=response.status_code,
                detail=self._extract_error_detail(response),
            )

        return response

    async def get_current_user_detail(self) -> UserDetailResponse:
        response = await self.send_request(method="get", url="/me")
        return UserDetailResponse(**response.json())

    async def add_song_to_queue(self, song_uri):
        _ = await self.send_request(
            method="post", url="/me/player/queue", params={"uri": song_uri}
        )

        return True

    async def search_song(self, song_name) -> SpotifyTrackResponse:
        response = await self.send_request(
            method="get",
            url="/search",
            params={"q": f"track:{song_name}", "type": "track", "limit": 25},
        )
        return SpotifyTrackResponse(**response.json())

    async def get_current_queue(self):
        response = await self.send_request(method="get", url="/me/player/queue")
        payload = response.json()
        data = {
            "currently_playing": (
                SpotifyTrack(**payload["currently_playing"]).model_dump()
                if payload.get("currently_playing")
                else None
            ),
            "queue": [
                SpotifyTrack(**item).model_dump() for item in payload.get("queue", [])
            ],
        }
        return SessionQueueResponse(**data)
