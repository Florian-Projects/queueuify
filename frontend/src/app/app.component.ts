import {Component, OnInit} from '@angular/core';
import {LoginService} from "./login.service";

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit{
  title = 'frontend';
  protected loggedIn: boolean = false;
  constructor(private readonly loginService: LoginService) {}
  ngOnInit() {
    this.loggedIn = this.loginService.loggedIn
    this.loginService.loggedInChanged.subscribe((loggedIn: boolean) => {
      this.loggedIn = loggedIn;
    });
  }
  protected onLogin({type}: { type: string }): void {
    if (type === "login") {
      this.loginService.login().subscribe((value) => location.href = value.authorization_url);
    } else {
      this.loginService.logout().subscribe((value) => this.loginService.setLoggedIn(false));
    }
  }
}
