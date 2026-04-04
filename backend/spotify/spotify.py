from fastapi import APIRouter, Request
from starlette.authentication import requires

from session.utils import get_active_session
from spotify_connector.spotify import SpotifyConnector

router = APIRouter()


@router.get("/search")
@requires(["authenticated"])
async def search_song_on_spotify(request: Request, song_name: str):
    user = request.user
    normalized_query = song_name.strip()
    if not normalized_query:
        return {"tracks": {"items": []}}

    if user.access_token:
        async with await SpotifyConnector.create(user=user) as spotify_connector:
            response = await spotify_connector.search_song(normalized_query)
            return response
    else:
        session = await get_active_session(user)
        session_owner = await session.owner if session else None

        if session_owner and session_owner.access_token:
            async with await SpotifyConnector.create(
                user=session_owner
            ) as spotify_connector:
                response = await spotify_connector.search_song(normalized_query)
                return response
        else:
            async with await SpotifyConnector.create() as spotify_connector:
                response = await spotify_connector.search_song(normalized_query)
                return response
