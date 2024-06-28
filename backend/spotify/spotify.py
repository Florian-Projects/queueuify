from fastapi import APIRouter, Request
from starlette.authentication import requires

from session.models import GroupSession
from spotify_connector.spotify import SpotifyConnector

router = APIRouter()


@router.get("/search")
@requires(["authenticated"])
async def search_song_on_spotify(request: Request, song_name: str):
    user = await request.user
    session = await user.groupsessions.all().first()
    session_owner = await session.owner.first()
    access_toke = None
    if user.access_token:
        access_toke = access_toke
    elif session_owner.access_token:
        access_toke = session_owner.access_token
    spotify_connector = await SpotifyConnector.create(access_token=access_toke)
    response = await spotify_connector.search_song(song_name)
    return response
