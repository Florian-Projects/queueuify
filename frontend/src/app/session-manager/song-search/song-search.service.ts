import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';

interface SpotifyAlbum {
  href?: string | null;
  id?: string | null;
  images?: { url: string }[] | null;
  name?: string | null;
  uri?: string | null;
}

interface SpotifyArtist {
  name: string;
  uri: string;
}

export interface SpotifyTrack {
  album?: SpotifyAlbum | null;
  artists: SpotifyArtist[];
  external_urls?: Record<string, string> | null;
  href?: string | null;
  id?: string | null;
  name?: string | null;
  uri?: string | null;
}

export interface SpotifyTrackList {
  items: SpotifyTrack[];
}

export interface SpotifyTrackResponse {
  tracks: SpotifyTrackList;
}

@Injectable({
  providedIn: 'root',
})
export class SongSearchService {
  private static readonly API = 'http://localhost:8000';
  constructor(private http: HttpClient) {}

  list(query = ''): Observable<SpotifyTrackResponse> {
    let session_token = localStorage.getItem('session_key');
    return this.http.get<SpotifyTrackResponse>(
      SongSearchService.API + '/spotify/search' + '?song_name=' + query,
      { headers: { Authorization: 'Bearer ' + session_token } },
    );
  }
}
