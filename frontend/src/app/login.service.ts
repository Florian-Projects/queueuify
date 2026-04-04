import { EventEmitter, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, Observable, of, pipe, tap, throwError } from 'rxjs';
import { environment } from '../environments/environments';

export interface LoginResponse {
  authorization_url: string;
}

export interface SessionTokenResponse {
  api_token: string;
  auth_mode: 'spotify' | 'anonymous';
  can_host_sessions: boolean;
  display_name: string;
}

export interface CurrentUserResponse {
  auth_mode: 'spotify' | 'anonymous';
  can_host_sessions: boolean;
  display_name: string;
}

export type AuthMode = 'spotify' | 'anonymous' | 'unknown' | null;

@Injectable({
  providedIn: 'root',
})
export class LoginService {
  private static readonly sessionKey = 'session_key';

  private static getRandomState() {
    const array = new Uint32Array(32);
    window.crypto.getRandomValues(array);

    const possibleCharacters =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from(array)
      .map((val) => possibleCharacters[val % possibleCharacters.length])
      .join('');
  }

  loggedIn: boolean = false;
  authMode: AuthMode = null;
  loggedInChanged: EventEmitter<boolean> = new EventEmitter<boolean>();
  authModeChanged: EventEmitter<AuthMode> = new EventEmitter<AuthMode>();

  constructor(private readonly http: HttpClient) {
    this.loggedIn = !!localStorage.getItem(LoginService.sessionKey);
    this.authMode = this.loggedIn ? 'unknown' : null;
  }

  private setState() {
    sessionStorage.setItem('oauthState', LoginService.getRandomState());
  }

  getState(): string {
    const state: string | null = sessionStorage.getItem('oauthState');
    return state !== null ? state : '';
  }

  getAuthMode(): AuthMode {
    return this.authMode;
  }

  canHostSessions(): boolean {
    return this.authMode === 'spotify';
  }

  private setAuthMode(value: AuthMode) {
    this.authMode = value;
    this.authModeChanged.emit(this.authMode);
  }

  setLoggedIn(value: boolean, authMode?: AuthMode) {
    this.loggedIn = value;
    if (value) {
      this.setAuthMode(authMode ?? 'unknown');
    } else {
      this.setAuthMode(null);
    }
    this.loggedInChanged.emit(this.loggedIn);
  }

  storeSessionToken(token: string, authMode: 'spotify' | 'anonymous') {
    localStorage.setItem(LoginService.sessionKey, token);
    this.setLoggedIn(true, authMode);
  }

  clearClientSession() {
    localStorage.removeItem(LoginService.sessionKey);
    this.setLoggedIn(false, null);
  }

  login(): Observable<LoginResponse> {
    this.setState();
    const state = this.getState();
    return this.http
      .get<LoginResponse>(environment.apiURL + '/login', {
        params: { state: state },
      })
      .pipe(this.alert_on_error('Failed to login'));
  }

  loginAnonymous(): Observable<SessionTokenResponse> {
    return this.http
      .post<SessionTokenResponse>(environment.apiURL + '/login/anonymous', {})
      .pipe(
        tap((response) =>
          this.storeSessionToken(response.api_token, response.auth_mode),
        ),
        this.alert_on_error('Failed to start anonymous session'),
      );
  }

  completeSpotifyLogin(
    code: string,
    state: string,
  ): Observable<SessionTokenResponse> {
    return this.http
      .post<SessionTokenResponse>(environment.apiURL + '/exchange_oauth_code', {
        code,
        state,
      })
      .pipe(
        tap((response) =>
          this.storeSessionToken(response.api_token, response.auth_mode),
        ),
        this.alert_on_error('Failed to complete Spotify login'),
      );
  }

  bootstrapCurrentUser(): Observable<CurrentUserResponse | null> {
    if (!localStorage.getItem(LoginService.sessionKey)) {
      this.clearClientSession();
      return of(null);
    }

    return this.http.get<CurrentUserResponse>(environment.apiURL + '/me').pipe(
      tap((response) => this.setLoggedIn(true, response.auth_mode)),
      catchError((error) => {
        if (error?.status === 401 || error?.status === 403) {
          this.clearClientSession();
        } else {
          this.setLoggedIn(true, 'unknown');
        }

        return throwError(() => error);
      }),
    );
  }

  logout(): Observable<{}> {
    return this.http
      .get<{}>(environment.apiURL + '/logout')
      .pipe(this.alert_on_error('Failed to logout'));
  }

  private alert_on_error(message: string): any {
    return pipe(
      catchError((error: any) => {
        const detail =
          error?.error?.detail ??
          error?.error?.details ??
          error?.message ??
          'Unknown error';
        alert(`${message}: ${detail}`);
        return throwError(() => error);
      }),
    );
  }
}
