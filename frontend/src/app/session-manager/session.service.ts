import { EventEmitter, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environments';
import {
  sessionQueue,
  SessionResponse,
  sessionState,
  user,
} from './session-manager.interfaces';

@Injectable({
  providedIn: 'root',
})
export class SessionService {
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
    this.http.get<SessionResponse>(environment.apiURL + '/session').subscribe({
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
    this.http
      .post<any>(environment.apiURL + '/session', {})
      .subscribe(() => this.fetchSessionState());
  }

  deleteSession(): void {
    this.http
      .delete<any>(environment.apiURL + '/session')
      .subscribe(() => this.fetchSessionState());
  }

  joinSession(sessionToken: string): void {
    this.http
      .post<any>(environment.apiURL + '/session/' + sessionToken + '/join', {})
      .subscribe(() => this.fetchSessionState());
  }

  leaveSession(sessionToken: string): void {
    this.http
      .post<any>(environment.apiURL + '/session/' + sessionToken + '/leave', {})
      .subscribe(() => this.fetchSessionState());
  }

  getSessionMembers(): Observable<Array<user>> {
    return this.http.get<Array<user>>(environment.apiURL + '/session/members');
  }

  addSongToQueue(uri: string): void {
    this.http
      .put<any>(
        environment.apiURL +
          '/session/' +
          this.sessionState.sessionToken +
          '/queue',
        {},
        {
          params: { song_id: uri },
        },
      )
      .subscribe();
  }

  getQueue(): Observable<sessionQueue> {
    return this.http.get<sessionQueue>(
      environment.apiURL +
        '/session/' +
        this.sessionState.sessionToken +
        '/queue',
    );
  }
}
