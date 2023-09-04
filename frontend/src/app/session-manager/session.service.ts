import { EventEmitter, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
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

@Injectable({
  providedIn: 'root',
})
export class SessionService {
  private static readonly API = 'http://127.0.0.1:8000';
  sessionChanged: EventEmitter<sessionState> = new EventEmitter<sessionState>();

  private sessionState: sessionState = {
    isInSession: false,
    sessionToken: null,
    isOwner: false,
  };

  constructor(private http: HttpClient) {}

  getSessionState(): sessionState {
    this.fetchSessionState();
    return this.sessionState;
  }

  fetchSessionState() {
    let session_key = localStorage.getItem('session_key');
    this.http
      .get<SessionResponse>(SessionService.API + '/session', {
        headers: { Authorization: 'Bearer ' + session_key },
      })
      .subscribe({
        next: (response) => {
          this.sessionState = {
            isInSession: true,
            sessionToken: response.token,
            isOwner: response.is_owner,
          };
          this.sessionChanged.emit(this.sessionState);
        },
        error: (e) => {
          this.sessionState = {
            isInSession: false,
            sessionToken: null,
            isOwner: false,
          };
          this.sessionChanged.emit(this.sessionState);
        },
      });
  }

  createSession(): void {
    let session_key = localStorage.getItem('session_key');
    this.http
      .post<any>(
        SessionService.API + '/session',
        {},
        {
          headers: { Authorization: 'Bearer ' + session_key },
        },
      )
      .subscribe(() => this.fetchSessionState());
  }

  deleteSession(): void {
    let session_key = localStorage.getItem('session_key');
    this.http
      .delete<any>(SessionService.API + '/session', {
        headers: { Authorization: 'Bearer ' + session_key },
      })
      .subscribe(() => this.fetchSessionState());
  }

  joinSession(sessionToken: string): void {
    let session_key = localStorage.getItem('session_key');
    this.http
      .post<any>(
        SessionService.API + '/session/' + sessionToken + '/join',
        {},
        {
          headers: { Authorization: 'Bearer ' + session_key },
        },
      )
      .subscribe(() => this.fetchSessionState());
  }

  leaveSession(sessionToken: string): void {
    let session_key = localStorage.getItem('session_key');
    this.http
      .post<any>(
        SessionService.API + '/session/' + sessionToken + '/leave',
        {},
        {
          headers: { Authorization: 'Bearer ' + session_key },
        },
      )
      .subscribe(() => this.fetchSessionState());
  }

  getSessionMembers(): Observable<Array<user>> {
    let session_key = localStorage.getItem('session_key');
    return this.http.get<Array<user>>(SessionService.API + '/session/members', {
      headers: { Authorization: 'Bearer ' + session_key },
    });
  }

  addSongToQueue(uri: string): void {
    let session_key = localStorage.getItem('session_key');
    this.http
      .put<any>(
        SessionService.API +
          '/session/' +
          this.sessionState.sessionToken +
          '/queue',
        {},
        {
          headers: { Authorization: 'Bearer ' + session_key },
          params: { song_id: uri },
        },
      )
      .subscribe();
  }

  getQueue(): Observable<sessionQueue> {
    let session_key = localStorage.getItem('session_key');
    return this.http.get<sessionQueue>(
      SessionService.API +
        '/session/' +
        this.sessionState.sessionToken +
        '/queue',
      { headers: { Authorization: 'Bearer ' + session_key } },
    );
  }
}
