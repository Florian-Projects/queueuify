from fastapi import APIRouter, Request
from starlette.authentication import requires
from spotify_connector.spotify import SpotifyConnector


router = APIRouter()


@router.get("/search")
@requires(["authenticated"])
async def search_song_on_spotify(request: Request, song_name: str):
    spotify_connector = SpotifyConnector(request.user.access_token)
    response = await spotify_connector.search_song(song_name)
    return response
