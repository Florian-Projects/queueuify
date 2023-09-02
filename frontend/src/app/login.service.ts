import {EventEmitter, Injectable} from '@angular/core';
import {HttpClient} from "@angular/common/http";
import {Observable, pipe, tap} from "rxjs";

export interface LoginResponse {
  authorization_url: string
}
@Injectable({
  providedIn: 'root'
})
export class LoginService {
  loggedIn: boolean = false;
  loggedInChanged: EventEmitter<boolean> = new EventEmitter<boolean>();

  private static readonly API = 'http://localhost:8000';
  constructor(private readonly http: HttpClient) {
    this.loggedIn = !!localStorage.getItem('session_key');
  }

  // Method to update the login state
  setLoggedIn(value: boolean) {
    this.loggedIn = value;
    this.loggedInChanged.emit(this.loggedIn);
  }
  login(): Observable<LoginResponse> {
    return this.http.get<LoginResponse>(LoginService.API + "/login").pipe(this.alert_on_error("Failed to login"))
  }

  logout(): Observable<{}> {
    let session_token = localStorage.getItem("session_key")
    return this.http.get<{}>(LoginService.API + "/logout", {headers: {"Authorization": "Bearer " + session_token}}).pipe(this.alert_on_error("Failed to login"))
  }
  private alert_on_error(message: string): any {
    return pipe(
      tap({ error: (e) => alert(`${message}: ${JSON.stringify(e)}`) }),
    );
  }
}
