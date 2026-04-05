import { SpotifyTrack } from './song-search/song-search.service';

export interface SessionResponse {
  is_owner: boolean;
  id: number;
  token: string;
  expiration_time: string;
  session_type?: 'host_only' | 'everyone';
  playback_backend?: 'spotify_host';
  disallow_anonymous_users?: boolean;
  explicit_filter?: boolean;
}

export interface sessionState {
  isInSession: boolean;
  sessionToken: string | null;
  isOwner: boolean;
  sessionType?: 'host_only' | 'everyone';
  playbackBackend?: 'spotify_host';
  disallowAnonymousUsers?: boolean;
  explicitFilter?: boolean;
}

export interface QueuePlaybackStatus {
  backend: 'spotify_host';
  device_id?: string | null;
  device_name?: string | null;
  device_available: boolean;
  device_is_restricted: boolean;
  is_playing: boolean;
  context_uri?: string | null;
  progress_ms?: number | null;
  dispatch_block_reason?: string | null;
}

export interface QueueCapabilities {
  can_add_to_queue: boolean;
  can_play_now: boolean;
  can_remove_queued_items: boolean;
  can_control_playback: boolean;
}

export interface QueueTrackProjection {
  source: 'queueify' | 'spotify_external';
  queue_item_id?: number | null;
  track: SpotifyTrack;
}

export interface QueueItem {
  id: number;
  status:
    | 'pending_sync'
    | 'sync_blocked'
    | 'sent_to_provider'
    | 'playing'
    | 'played'
    | 'removed'
    | 'sync_failed';
  provider_dispatch_state: string;
  submitted_by?: string | null;
  submitted_at: string;
  can_remove: boolean;
  can_play_now: boolean;
  track: SpotifyTrack;
}

export interface sessionQueue {
  now_playing: QueueTrackProjection | null;
  playback_status: QueuePlaybackStatus;
  capabilities: QueueCapabilities;
  queue_items: Array<QueueItem>;
  external_items: Array<QueueTrackProjection>;
  currently_playing: SpotifyTrack | null;
  queue: Array<SpotifyTrack>;
}

export interface PlaybackProgressViewModel {
  track: SpotifyTrack | null;
  isPlaying: boolean;
  elapsedMs: number;
  durationMs: number | null;
  elapsedLabel: string;
  durationLabel: string;
  progressPercent: number;
}

export interface user {
  id: number;
  display_name: string;
  auth_mode?: 'spotify' | 'anonymous';
  is_guest?: boolean;
  is_active_member?: boolean;
  is_banned?: boolean;
  is_timed_out?: boolean;
  timeout_until?: string | null;
  timeout_remaining_seconds?: number | null;
  can_kick?: boolean;
  can_ban?: boolean;
  can_timeout?: boolean;
  can_unban?: boolean;
  can_unmute?: boolean;
}

export interface SessionPlaybackTargetStatus {
  user_id: number;
  display_name: string;
  auth_mode: 'spotify' | 'anonymous';
  is_host: boolean;
  eligible_for_everyone_playback: boolean;
  device_available: boolean;
  device_is_restricted: boolean;
  is_playing: boolean;
  sync_state:
    | 'synced'
    | 'ready'
    | 'out_of_sync'
    | 'no_active_device'
    | 'restricted_device'
    | 'no_spotify_session'
    | 'anonymous_user'
    | 'playback_error';
  status_message: string;
}

export interface EveryonePlaybackStatus {
  ready_member_count: number;
  unsynced_member_count: number;
  eligible_member_count: number;
  can_start_everyone_playback: boolean;
  status_message: string;
}

export interface SessionSettingsResponse {
  session_type: 'host_only' | 'everyone';
  playback_backend: 'spotify_host';
  disallow_anonymous_users: boolean;
  explicit_filter: boolean;
  everyone_playback_status: EveryonePlaybackStatus;
  member_sync_status: SessionPlaybackTargetStatus[];
}

export interface SessionSettingsUpdateRequest {
  session_type?: 'host_only' | 'everyone';
  disallow_anonymous_users?: boolean;
  explicit_filter?: boolean;
}
