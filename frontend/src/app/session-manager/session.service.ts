import { EventEmitter, Injectable } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';
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

  private sessionState: sessionState = this.createEmptySessionState();

  constructor(private http: HttpClient) {}

  private createEmptySessionState(): sessionState {
    return {
      isInSession: false,
      sessionToken: null,
      isOwner: false,
    };
  }

  private applySessionState(sessionState: sessionState): sessionState {
    this.sessionState = sessionState;
    this.sessionChanged.emit(this.sessionState);
    return this.sessionState;
  }

  getSessionState(): sessionState {
    if (!localStorage.getItem('session_key')) {
      this.resetSessionState();
      return this.sessionState;
    }

    this.fetchSessionState();
    return this.sessionState;
  }

  resetSessionState(): void {
    this.applySessionState(this.createEmptySessionState());
  }

  fetchSessionStateRequest(): Observable<sessionState> {
    if (!localStorage.getItem('session_key')) {
      return of(this.applySessionState(this.createEmptySessionState()));
    }

    return this.http.get<SessionResponse>(environment.apiURL + '/session').pipe(
      map((response) =>
        this.applySessionState({
          isInSession: true,
          sessionToken: response.token,
          isOwner: response.is_owner,
        }),
      ),
      catchError(() => of(this.applySessionState(this.createEmptySessionState()))),
    );
  }

  fetchSessionState(): void {
    this.fetchSessionStateRequest().subscribe();
  }

  createSession(): void {
    this.createSessionRequest().subscribe();
  }

  createSessionRequest(): Observable<unknown> {
    return this.http
      .post<unknown>(environment.apiURL + '/session', {})
      .pipe(tap(() => this.fetchSessionState()));
  }

  deleteSession(): void {
    this.http
      .delete<any>(environment.apiURL + '/session')
      .subscribe(() => this.fetchSessionState());
  }

  joinSession(sessionToken: string): void {
    this.joinSessionRequest(sessionToken).subscribe();
  }

  joinSessionRequest(sessionToken: string): Observable<unknown> {
    const normalizedToken = this.normalizeSessionToken(sessionToken);
    return this.http
      .post<unknown>(
        environment.apiURL + '/session/' + normalizedToken + '/join',
        {},
      )
      .pipe(tap(() => this.fetchSessionState()));
  }

  leaveSession(sessionToken: string): void {
    const normalizedToken = this.normalizeSessionToken(sessionToken);
    this.http
      .post<any>(
        environment.apiURL + '/session/' + normalizedToken + '/leave',
        {},
      )
      .subscribe(() => this.fetchSessionState());
  }

  normalizeSessionToken(sessionToken: string): string {
    return sessionToken.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6);
  }

  getSessionMembers(): Observable<Array<user>> {
    return this.http.get<Array<user>>(environment.apiURL + '/session/members');
  }

  addSongToQueue(uri: string): void {
    this.addSongToQueueRequest(uri).subscribe();
  }

  addSongToQueueRequest(uri: string): Observable<unknown> {
    if (!this.sessionState.sessionToken) {
      throw new Error('Cannot queue a song without an active session token.');
    }

    return this.http.put<unknown>(
      environment.apiURL + '/session/' + this.sessionState.sessionToken + '/queue',
      {},
      {
        params: { song_id: uri },
      },
    );
  }

  getQueue(): Observable<sessionQueue> {
    if (!this.sessionState.sessionToken) {
      throw new Error('Cannot load the queue without an active session token.');
    }

    return this.http.get<sessionQueue>(
      environment.apiURL +
        '/session/' +
        this.sessionState.sessionToken +
        '/queue',
    );
  }
}
