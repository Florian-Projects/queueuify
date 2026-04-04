import base64
from http import HTTPStatus
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException

from config.settings import get_settings


class SpotifyOAuth:
    timeout = httpx.Timeout(15.0, connect=5.0)

    def __init__(self, client_id, client_secret, redirect_uri):
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri
        self.authorization_base_url = "https://accounts.spotify.com/authorize"
        self.token_url = "https://accounts.spotify.com/api/token"
        self.basic_authorization_token = base64.b64encode(
            f"{self.client_id}:{self.client_secret}".encode("utf-8")
        ).decode("utf-8")

    @staticmethod
    def _extract_error_detail(response: httpx.Response):
        try:
            data = response.json()
        except ValueError:
            return response.text or response.reason_phrase

        if isinstance(data, dict):
            if isinstance(data.get("error"), dict) and data["error"].get("message"):
                return data["error"]["message"]
            if data.get("error_description"):
                return data["error_description"]
            if data.get("error"):
                return data["error"]

        return data

    async def _token_request(self, data: dict, failure_message: str):
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    self.token_url,
                    headers={
                        "Authorization": f"Basic {self.basic_authorization_token}",
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                    data=data,
                )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=HTTPStatus.BAD_GATEWAY,
                detail=f"{failure_message}: {exc}",
            ) from exc

        if response.status_code != HTTPStatus.OK:
            raise HTTPException(
                status_code=HTTPStatus.BAD_GATEWAY,
                detail=f"{failure_message}: {self._extract_error_detail(response)}",
            )

        return response.json()

    async def get_authorization_url(self, state: str, scope: str = None) -> httpx.URL:
        """
        :param scope: space seperated list of scopes
        """
        params = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "state": state,
        }
        if scope:
            params["scope"] = scope

        return httpx.URL(f"{self.authorization_base_url}?{urlencode(params)}")

    async def exchange_code_for_token(self, code) -> tuple[str, str]:
        response = await self._token_request(
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": self.redirect_uri,
            },
            "Failed to retrieve Spotify access token",
        )
        return response["access_token"], response["refresh_token"]

    async def get_client_credentials(self):
        response = await self._token_request(
            {
                "grant_type": "client_credentials",
            },
            "Failed to retrieve Spotify client credentials",
        )
        return response["access_token"]

    async def refresh_access_token(self, refresh_token: str):
        response = await self._token_request(
            {
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
            },
            "Failed to refresh Spotify access token",
        )
        return response["access_token"], response.get("refresh_token")


spotify_oauth = SpotifyOAuth(
    client_id=get_settings().spotify_client_id,
    client_secret=get_settings().spotify_client_secret,
    redirect_uri=get_settings().redirect_uri,
)
