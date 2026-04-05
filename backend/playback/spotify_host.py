from datetime import datetime, timezone

from spotify_connector.spotify import SpotifyConnector, SpotifyException

from playback.base import PlaybackProvider, ProviderPlaybackState
from session.models import PlaybackBackend


class SpotifyHostPlaybackProvider(PlaybackProvider):
    backend = PlaybackBackend.SPOTIFY_HOST.value

    async def fetch_state(self, host_user):
        async with await SpotifyConnector.create(user=host_user) as connector:
            playback_state = await connector.get_playback_state()
            devices = await connector.get_available_devices()
            try:
                observed_queue = await connector.get_current_queue()
            except SpotifyException:
                observed_queue = None

        # Spotify's playback-state timestamp reflects the last state change,
        # not when this progress sample was observed. Cache aging needs the
        # local observation time or progress will run ahead while a track keeps
        # playing.
        observed_at = datetime.now(timezone.utc)

        active_device = None
        if playback_state and playback_state.device and playback_state.device.id:
            active_device = playback_state.device
        else:
            active_device = next(
                (device for device in devices.devices if device.is_active),
                None,
            )

        if active_device and active_device.is_restricted:
            dispatch_block_reason = "restricted_device"
        elif not active_device:
            dispatch_block_reason = "no_active_device"
        elif playback_state is None or playback_state.item is None:
            dispatch_block_reason = "no_active_playback"
        else:
            dispatch_block_reason = None

        return ProviderPlaybackState(
            backend=self.backend,
            device_id=active_device.id if active_device else None,
            device_name=active_device.name if active_device else None,
            device_available=active_device is not None,
            device_is_restricted=active_device.is_restricted if active_device else False,
            is_playing=playback_state.is_playing if playback_state else False,
            context_uri=playback_state.context.uri
            if playback_state and playback_state.context
            else None,
            progress_ms=playback_state.progress_ms if playback_state else None,
            observed_at=observed_at,
            dispatch_block_reason=dispatch_block_reason,
            current_track=playback_state.item if playback_state else None,
            observed_queue=observed_queue.queue if observed_queue else [],
        )

    async def enqueue(self, host_user, track_uri: str, device_id=None):
        async with await SpotifyConnector.create(user=host_user) as connector:
            await connector.add_song_to_queue(track_uri, device_id=device_id)

    async def play_now(self, host_user, track_uri: str, device_id=None):
        async with await SpotifyConnector.create(user=host_user) as connector:
            await connector.start_playback(uris=[track_uri], device_id=device_id)

    async def pause(self, host_user, device_id=None):
        async with await SpotifyConnector.create(user=host_user) as connector:
            await connector.pause_playback(device_id=device_id)

    async def resume(self, host_user, device_id=None):
        async with await SpotifyConnector.create(user=host_user) as connector:
            await connector.start_playback(device_id=device_id)

    async def skip_next(self, host_user, device_id=None):
        async with await SpotifyConnector.create(user=host_user) as connector:
            await connector.skip_to_next(device_id=device_id)

    async def skip_previous(self, host_user, device_id=None):
        async with await SpotifyConnector.create(user=host_user) as connector:
            await connector.skip_to_previous(device_id=device_id)
