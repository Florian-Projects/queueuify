import base64

import httpx
from fastapi import HTTPException

from config.settings import get_settings


class SpotifyOAuth:
    def __init__(self, client_id, client_secret, redirect_uri):
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri
        self.authorization_base_url = "https://accounts.spotify.com/authorize"
        self.token_url = "https://accounts.spotify.com/api/token"
        self.basic_authorization_token = base64.b64encode(
            f"{self.client_id}:{self.client_secret}".encode("utf-8")
        ).decode("utf-8")

    async def get_authorization_url(self, state: str, scope: str = None) -> httpx.URL:
        """
        :param scope: space seperated list of scopes
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(
                self.authorization_base_url,
                params={
                    "client_id": self.client_id,
                    "redirect_uri": self.redirect_uri,
                    "scope": scope,
                    "response_type": "code",
                    "state": state,
                },
            )
            return response.url

    async def exchange_code_for_token(self, code) -> tuple[str, str]:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.token_url,
                headers={"Authorization": f"Basic {self.basic_authorization_token}"},
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": self.redirect_uri,
                },
            )
            if response.status_code != 200:
                raise HTTPException(
                    status_code=400, detail="Failed to retrieve access token"
                )
            return response.json()["access_token"], response.json()["refresh_token"]

    async def get_client_credentials(self):
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.token_url,
                headers={
                    "Authorization": f"Basic {self.basic_authorization_token}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data={
                    "grant_type": "client_credentials",
                },
            )
            if response.status_code != 200:
                raise HTTPException(
                    status_code=400, detail="Failed to retrieve access token"
                )
            return response.json()["access_token"]

    async def refresh_access_token(self, refresh_token: str):
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.token_url,
                headers={"Authorization": f"Basic {self.basic_authorization_token}"},
                data={
                    "grant_type": "authorization_code",
                    "code": refresh_token,
                    "redirect_uri": self.redirect_uri,
                },
            )
            if response.status_code != 200:
                raise HTTPException(
                    status_code=400, detail="Failed to retrieve access token"
                )
            return response.json()["access_token"], response.json()["refresh_token"]


spotify_oauth = SpotifyOAuth(
    client_id=get_settings().spotify_client_id,
    client_secret=get_settings().spotify_client_secret,
    redirect_uri=get_settings().redirect_uri,
)
