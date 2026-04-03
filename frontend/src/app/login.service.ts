import { EventEmitter, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, Observable, pipe, tap, throwError } from 'rxjs';
import { environment } from '../environments/environments';

export interface LoginResponse {
  authorization_url: string;
}

export interface AnonymousLoginResponse {
  api_token: string;
}

export type AuthMode = 'spotify' | 'anonymous' | 'unknown' | null;

@Injectable({
  providedIn: 'root',
})
export class LoginService {
  private static readonly authModeKey = 'queueify_auth_mode';
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
    this.authMode = this.readStoredAuthMode();
  }

  private readStoredAuthMode(): AuthMode {
    const storedAuthMode = localStorage.getItem(LoginService.authModeKey);
    if (storedAuthMode === 'spotify' || storedAuthMode === 'anonymous') {
      return storedAuthMode;
    }

    return this.loggedIn ? 'unknown' : null;
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
    if (value === 'spotify' || value === 'anonymous') {
      localStorage.setItem(LoginService.authModeKey, value);
    } else {
      localStorage.removeItem(LoginService.authModeKey);
    }
    this.authModeChanged.emit(this.authMode);
  }

  setLoggedIn(value: boolean, authMode?: AuthMode) {
    this.loggedIn = value;
    if (value) {
      this.setAuthMode(authMode ?? this.readStoredAuthMode() ?? 'unknown');
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
    localStorage.removeItem(LoginService.authModeKey);
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

  loginAnonymous(): Observable<AnonymousLoginResponse> {
    this.setState();
    return this.http
      .get<AnonymousLoginResponse>(environment.apiURL + '/login', {
        params: { state: 'anonymous' },
      })
      .pipe(
        tap((response) =>
          this.storeSessionToken(response.api_token, 'anonymous'),
        ),
        this.alert_on_error('Failed to login'),
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
        alert(`${message}: ${JSON.stringify(error)}`);
        return throwError(() => error);
      }),
    );
  }
}
