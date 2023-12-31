import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environments';

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
  constructor(private http: HttpClient) {}

  list(query = ''): Observable<SpotifyTrackResponse> {
    return this.http.get<SpotifyTrackResponse>(
      environment.apiURL + '/spotify/search',
      { params: { song_name: query } },
    );
  }
}
