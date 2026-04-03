from fastapi import APIRouter, Request
from starlette.authentication import requires

from session.utils import get_active_session
from spotify_connector.spotify import SpotifyConnector

router = APIRouter()


@router.get("/search")
@requires(["authenticated"])
async def search_song_on_spotify(request: Request, song_name: str):
    user = await request.user
    if not song_name.strip():
        return {"tracks": {"items": []}}

    if user.access_token:
        spotify_connector = await SpotifyConnector.create(user=user)
    else:
        session = await get_active_session(user)
        session_owner = await session.owner if session else None

        if session_owner and session_owner.access_token:
            spotify_connector = await SpotifyConnector.create(user=session_owner)
        else:
            spotify_connector = await SpotifyConnector.create()

    response = await spotify_connector.search_song(song_name)
    return response
