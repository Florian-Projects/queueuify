from playback.spotify_host import SpotifyHostPlaybackProvider
from session.models import PlaybackBackend


def get_playback_provider(backend: PlaybackBackend):
    if backend == PlaybackBackend.SPOTIFY_HOST:
        return SpotifyHostPlaybackProvider()

    raise ValueError(f"Unsupported playback backend: {backend}")
