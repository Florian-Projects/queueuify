import { EventEmitter, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, Observable, pipe, tap, throwError } from 'rxjs';
import { environment } from '../environments/environments';

export interface LoginResponse {
  authorization_url: string;
}
@Injectable({
  providedIn: 'root',
})
export class LoginService {
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
  loggedInChanged: EventEmitter<boolean> = new EventEmitter<boolean>();

  constructor(private readonly http: HttpClient) {
    this.loggedIn = !!localStorage.getItem('session_key');
  }
  private setState() {
    sessionStorage.setItem('oauthState', LoginService.getRandomState());
  }
  getState(): string {
    const state: string | null = sessionStorage.getItem('oauthState');
    return state !== null ? state : '';
  }
  // Method to update the login state
  setLoggedIn(value: boolean) {
    this.loggedIn = value;
    this.loggedInChanged.emit(this.loggedIn);
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

  logout(): Observable<{}> {
    return this.http
      .get<{}>(environment.apiURL + '/logout')
      .pipe(this.alert_on_error('Failed to login'));
  }
  private alert_on_error(message: string): any {
    return pipe(
      catchError((error: any) => {
        alert(`${message}: ${JSON.stringify(error)}`);
        return throwError(error); // Re-throw the error so subscribers can handle it if they want
      }),
    );
  }
}
