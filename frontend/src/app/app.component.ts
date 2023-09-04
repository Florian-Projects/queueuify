import {Component, OnInit} from '@angular/core';
import {LoginService} from './login.service';
import {Observable} from 'rxjs';
import {SessionService} from "./session-manager/session.service";

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit {
  title = 'frontend';
  protected loggedIn: boolean = false;

  constructor(private readonly loginService: LoginService, private sessionService: SessionService) {
  }

  ngOnInit() {
    this.loggedIn = this.loginService.loggedIn;
    this.loginService.loggedInChanged.subscribe((loggedIn: boolean) => {
      this.loggedIn = loggedIn;
    });
  }

  protected onLogin({type}: { type: string }): void {
    if (type === 'login') {
      this.loginService
        .login()
        .subscribe((value) => (location.href = value.authorization_url));
    } else {
      this.loginService.logout().subscribe({
        next: (value) => {
          localStorage.removeItem("session_key");
          this.sessionService.sessionChanged.emit({sessionToken: "", isInSession: false, isOwner: false});
          this.loginService.setLoggedIn(false);
        },
        error: (error) => {
          if (error.status === 403) {
            localStorage.removeItem("session_key");
            this.sessionService.sessionChanged.emit();
          }
        }
      });
    }
  };
}
