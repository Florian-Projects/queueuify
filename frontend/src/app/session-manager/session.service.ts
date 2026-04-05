import { EventEmitter, Injectable } from '@angular/core';
import {
  BehaviorSubject,
  Observable,
  catchError,
  map,
  of,
  tap,
  throwError,
} from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environments';
import {
  SessionSettingsResponse,
  SessionSettingsUpdateRequest,
  QueueItem,
  sessionQueue,
  SessionResponse,
  sessionState,
  user,
} from './session-manager.interfaces';
import { SpotifyTrack } from './song-search/song-search.service';

@Injectable({
  providedIn: 'root',
})
export class SessionService {
  sessionChanged: EventEmitter<sessionState> = new EventEmitter<sessionState>();

  private sessionState: sessionState = this.createEmptySessionState();
  private readonly queueStateSubject = new BehaviorSubject<sessionQueue | null>(
    null,
  );

  readonly queueState$ = this.queueStateSubject.asObservable();

  constructor(private http: HttpClient) {}

  private createEmptySessionState(): sessionState {
    return {
      isInSession: false,
      sessionToken: null,
      isOwner: false,
      sessionType: 'host_only',
      playbackBackend: 'spotify_host',
      disallowAnonymousUsers: false,
      explicitFilter: false,
    };
  }

  private isSameSessionState(nextState: sessionState): boolean {
    return (
      this.sessionState.isInSession === nextState.isInSession &&
      this.sessionState.sessionToken === nextState.sessionToken &&
      this.sessionState.isOwner === nextState.isOwner &&
      this.sessionState.sessionType === nextState.sessionType &&
      this.sessionState.playbackBackend === nextState.playbackBackend &&
      this.sessionState.disallowAnonymousUsers ===
        nextState.disallowAnonymousUsers &&
      this.sessionState.explicitFilter === nextState.explicitFilter
    );
  }

  private applySessionState(
    sessionState: sessionState,
    emitChanges = true,
  ): sessionState {
    if (this.isSameSessionState(sessionState)) {
      return this.sessionState;
    }

    this.sessionState = sessionState;
    if (emitChanges) {
      this.sessionChanged.emit(this.sessionState);
    }
    return this.sessionState;
  }

  private applySessionSummary(response: SessionResponse): sessionState {
    if (this.sessionState.sessionToken !== response.token) {
      this.queueStateSubject.next(null);
    }

    return this.applySessionState({
      isInSession: true,
      sessionToken: response.token,
      isOwner: response.is_owner,
      sessionType: response.session_type ?? 'host_only',
      playbackBackend: response.playback_backend ?? 'spotify_host',
      disallowAnonymousUsers: response.disallow_anonymous_users ?? false,
      explicitFilter: response.explicit_filter ?? false,
    });
  }

  private mergeSessionSettings(response: SessionSettingsResponse): void {
    if (!this.sessionState.isInSession) {
      return;
    }

    this.applySessionState({
      ...this.sessionState,
      sessionType: response.session_type,
      playbackBackend: response.playback_backend,
      disallowAnonymousUsers: response.disallow_anonymous_users,
      explicitFilter: response.explicit_filter,
    }, false);
  }

  private sessionAccessWasLost(error: any): boolean {
    const status = error?.status;
    const detail = String(
      error?.error?.detail ?? error?.error?.details ?? '',
    ).toLowerCase();

    if (status === 401) {
      return true;
    }

    if (status === 404) {
      return (
        detail.includes('user not in session') ||
        detail.includes('session not found') ||
        detail.includes('user is not the owner of any session')
      );
    }

    if (status === 403) {
      return (
        detail.includes('user is not a member of the session') ||
        detail.includes('only the host can manage room members')
      );
    }

    return false;
  }

  private handleSessionAccessError<T>() {
    return catchError<T, Observable<never>>((error) => {
      if (this.sessionAccessWasLost(error)) {
        this.resetSessionState();
      }

      return throwError(() => error);
    });
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
    this.queueStateSubject.next(null);
    this.applySessionState(this.createEmptySessionState());
  }

  getCurrentQueueState(): sessionQueue | null {
    return this.queueStateSubject.value;
  }

  fetchSessionStateRequest(): Observable<sessionState> {
    if (!localStorage.getItem('session_key')) {
      this.resetSessionState();
      return of(this.sessionState);
    }

    return this.http.get<SessionResponse>(environment.apiURL + '/session').pipe(
      map((response) => this.applySessionSummary(response)),
      catchError((error) => {
        if (this.sessionAccessWasLost(error)) {
          this.resetSessionState();
          return of(this.sessionState);
        }

        return throwError(() => error);
      }),
    );
  }

  fetchSessionState(): void {
    this.fetchSessionStateRequest().subscribe({
      error: () => undefined,
    });
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
    return this.http
      .get<Array<user>>(environment.apiURL + '/session/members')
      .pipe(this.handleSessionAccessError());
  }

  getSessionSettingsRequest(): Observable<SessionSettingsResponse> {
    const sessionToken = this.ensureSessionTokenForActiveSession(
      'Cannot load session settings without an active session token.',
    );
    return this.http
      .get<SessionSettingsResponse>(
        environment.apiURL + '/session/' + sessionToken + '/settings',
      )
      .pipe(
        tap((response) => {
          this.mergeSessionSettings(response);
        }),
        this.handleSessionAccessError(),
      );
  }

  updateSessionSettingsRequest(
    body: SessionSettingsUpdateRequest,
  ): Observable<SessionSettingsResponse> {
    const sessionToken = this.ensureSessionTokenForActiveSession(
      'Cannot update session settings without an active session token.',
    );
    return this.http
      .patch<SessionSettingsResponse>(
        environment.apiURL + '/session/' + sessionToken + '/settings',
        body,
      )
      .pipe(
        tap((response) => {
          this.mergeSessionSettings(response);
        }),
        this.handleSessionAccessError(),
      );
  }

  private ensureSessionTokenForActiveSession(errorMessage: string): string {
    if (!this.sessionState.sessionToken) {
      throw new Error(errorMessage);
    }

    return this.sessionState.sessionToken;
  }

  timeoutSessionMember(memberId: number, durationMinutes: number): Observable<Array<user>> {
    const sessionToken = this.ensureSessionTokenForActiveSession(
      'Cannot manage members without an active session token.',
    );
    return this.http.post<Array<user>>(
      environment.apiURL +
        '/session/' +
        sessionToken +
        '/members/' +
        memberId +
        '/timeout',
      { duration_minutes: durationMinutes },
    ).pipe(this.handleSessionAccessError());
  }

  unmuteSessionMember(memberId: number): Observable<Array<user>> {
    const sessionToken = this.ensureSessionTokenForActiveSession(
      'Cannot manage members without an active session token.',
    );
    return this.http.post<Array<user>>(
      environment.apiURL +
        '/session/' +
        sessionToken +
        '/members/' +
        memberId +
        '/unmute',
      {},
    ).pipe(this.handleSessionAccessError());
  }

  kickSessionMember(memberId: number): Observable<Array<user>> {
    const sessionToken = this.ensureSessionTokenForActiveSession(
      'Cannot manage members without an active session token.',
    );
    return this.http.post<Array<user>>(
      environment.apiURL +
        '/session/' +
        sessionToken +
        '/members/' +
        memberId +
        '/kick',
      {},
    ).pipe(this.handleSessionAccessError());
  }

  banSessionMember(memberId: number): Observable<Array<user>> {
    const sessionToken = this.ensureSessionTokenForActiveSession(
      'Cannot manage members without an active session token.',
    );
    return this.http.post<Array<user>>(
      environment.apiURL +
        '/session/' +
        sessionToken +
        '/members/' +
        memberId +
        '/ban',
      {},
    ).pipe(this.handleSessionAccessError());
  }

  unbanSessionMember(memberId: number): Observable<Array<user>> {
    const sessionToken = this.ensureSessionTokenForActiveSession(
      'Cannot manage members without an active session token.',
    );
    return this.http.post<Array<user>>(
      environment.apiURL +
        '/session/' +
        sessionToken +
        '/members/' +
        memberId +
        '/unban',
      {},
    ).pipe(this.handleSessionAccessError());
  }

  private ensureTrackRequest(track: SpotifyTrack) {
    return {
      id: track.id ?? null,
      uri: track.uri ?? '',
      name: track.name ?? 'Unknown track',
      artists: (track.artists ?? []).map((artist) => ({
        name: artist.name,
        uri: artist.uri,
      })),
      album: {
        images: (track.album?.images ?? []).map((image) => ({
          url: image.url,
        })),
      },
      duration_ms: track.duration_ms ?? null,
      explicit: track.explicit ?? null,
    };
  }

  private mapQueueProjection(response: any): sessionQueue {
    const queueItems: QueueItem[] = response?.queue_items ?? [];
    return {
      now_playing: response?.now_playing ?? null,
      playback_status: response?.playback_status ?? {
        backend: 'spotify_host',
        device_available: false,
        device_is_restricted: false,
        is_playing: false,
      },
      capabilities: response?.capabilities ?? {
        can_add_to_queue: true,
        can_play_now: false,
        can_remove_queued_items: false,
        can_control_playback: false,
      },
      queue_items: queueItems,
      external_items: response?.external_items ?? [],
      currently_playing: response?.now_playing?.track ?? null,
      queue: queueItems.map((item) => item.track),
    };
  }

  private publishQueueProjection(response: any): sessionQueue {
    const queueProjection = this.mapQueueProjection(response);
    this.queueStateSubject.next(queueProjection);
    return queueProjection;
  }

  addSongToQueue(track: SpotifyTrack): void {
    this.addSongToQueueRequest(track).subscribe();
  }

  addSongToQueueRequest(track: SpotifyTrack): Observable<sessionQueue> {
    if (!this.sessionState.sessionToken) {
      throw new Error('Cannot queue a song without an active session token.');
    }

    return this.http
      .post<any>(
        environment.apiURL +
          '/session/' +
          this.sessionState.sessionToken +
          '/queue/items',
        this.ensureTrackRequest(track),
      )
      .pipe(
        map((response) => this.publishQueueProjection(response)),
        this.handleSessionAccessError(),
      );
  }

  playTrackNowRequest(track: SpotifyTrack): Observable<sessionQueue> {
    if (!this.sessionState.sessionToken) {
      throw new Error('Cannot control playback without an active session token.');
    }

    return this.http
      .post<any>(
        environment.apiURL +
          '/session/' +
          this.sessionState.sessionToken +
          '/playback/play-now',
        this.ensureTrackRequest(track),
      )
      .pipe(
        map((response) => this.publishQueueProjection(response)),
        this.handleSessionAccessError(),
      );
  }

  playQueueItemNowRequest(itemId: number): Observable<sessionQueue> {
    if (!this.sessionState.sessionToken) {
      throw new Error('Cannot control playback without an active session token.');
    }

    return this.http
      .post<any>(
        environment.apiURL +
          '/session/' +
          this.sessionState.sessionToken +
          '/queue/items/' +
          itemId +
          '/play',
        {},
      )
      .pipe(
        map((response) => this.publishQueueProjection(response)),
        this.handleSessionAccessError(),
      );
  }

  pausePlaybackRequest(): Observable<sessionQueue> {
    if (!this.sessionState.sessionToken) {
      throw new Error('Cannot control playback without an active session token.');
    }

    return this.http
      .post<any>(
        environment.apiURL +
          '/session/' +
          this.sessionState.sessionToken +
          '/playback/pause',
        {},
      )
      .pipe(
        map((response) => this.publishQueueProjection(response)),
        this.handleSessionAccessError(),
      );
  }

  resumePlaybackRequest(): Observable<sessionQueue> {
    if (!this.sessionState.sessionToken) {
      throw new Error('Cannot control playback without an active session token.');
    }

    return this.http
      .post<any>(
        environment.apiURL +
          '/session/' +
          this.sessionState.sessionToken +
          '/playback/resume',
        {},
      )
      .pipe(
        map((response) => this.publishQueueProjection(response)),
        this.handleSessionAccessError(),
      );
  }

  skipToNextRequest(): Observable<sessionQueue> {
    if (!this.sessionState.sessionToken) {
      throw new Error('Cannot control playback without an active session token.');
    }

    return this.http
      .post<any>(
        environment.apiURL +
          '/session/' +
          this.sessionState.sessionToken +
          '/playback/next',
        {},
      )
      .pipe(
        map((response) => this.publishQueueProjection(response)),
        this.handleSessionAccessError(),
      );
  }

  skipToPreviousRequest(): Observable<sessionQueue> {
    if (!this.sessionState.sessionToken) {
      throw new Error('Cannot control playback without an active session token.');
    }

    return this.http
      .post<any>(
        environment.apiURL +
          '/session/' +
          this.sessionState.sessionToken +
          '/playback/previous',
        {},
      )
      .pipe(
        map((response) => this.publishQueueProjection(response)),
        this.handleSessionAccessError(),
      );
  }

  removeQueueItemRequest(itemId: number): Observable<sessionQueue> {
    if (!this.sessionState.sessionToken) {
      throw new Error('Cannot modify the queue without an active session token.');
    }

    return this.http
      .delete<any>(
        environment.apiURL +
          '/session/' +
          this.sessionState.sessionToken +
          '/queue/items/' +
          itemId,
      )
      .pipe(
        map((response) => this.publishQueueProjection(response)),
        this.handleSessionAccessError(),
      );
  }

  getQueue(): Observable<sessionQueue> {
    if (!this.sessionState.sessionToken) {
      throw new Error('Cannot load the queue without an active session token.');
    }

    return this.http
      .get<any>(
        environment.apiURL +
          '/session/' +
          this.sessionState.sessionToken +
          '/queue',
      )
      .pipe(
        map((response) => this.publishQueueProjection(response)),
        this.handleSessionAccessError(),
      );
  }
}
