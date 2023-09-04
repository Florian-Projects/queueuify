import { SpotifyTrack } from './song-search/song-search.service';

export interface SessionResponse {
  is_owner: boolean;
  id: number;
  token: string;
  expiration_time: string;
}

export interface sessionState {
  isInSession: boolean;
  sessionToken: string | null;
  isOwner: boolean;
}

export interface sessionQueue {
  currently_playing: SpotifyTrack;
  queue: Array<SpotifyTrack>;
}

export interface user {
  id: string;
  display_name: string;
}
