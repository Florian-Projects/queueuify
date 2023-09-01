import httpx

from spotify_connector.models import UserDetailResponse


class SpotifyConnector:
    def __init__(self, access_token: str):
        self.client = httpx.AsyncClient(
            headers={"Authorization": f"Bearer {access_token}"},
            base_url="https://api.spotify.com/v1",
        )

    async def get_current_user_detail(self) -> UserDetailResponse:
        response = await self.client.get("/me")
        return UserDetailResponse(**response.json())
