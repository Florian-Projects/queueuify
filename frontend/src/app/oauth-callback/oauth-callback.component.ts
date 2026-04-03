import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { LoginService } from '../login.service';
import { environment } from '../../environments/environments';
import { SessionService } from '../session-manager/session.service';

@Component({
  selector: 'app-oauth-callback',
  templateUrl: './oauth-callback.component.html',
  styleUrls: ['./oauth-callback.component.scss'],
})
export class OauthCallbackComponent implements OnInit {
  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private router: Router,
    private loginService: LoginService,
    private sessionService: SessionService,
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      const code = params['code'];
      const state = params['state'];
      if (state === this.loginService.getState()) {
        this.http
          .post(environment.apiURL + '/exchange_oauth_code', { code, state })
          .subscribe((response: any) => {
            this.loginService.storeSessionToken(response.api_token, 'spotify');
            this.sessionService.fetchSessionStateRequest().subscribe((sessionState) => {
              this.router.navigateByUrl(sessionState.isInSession ? '/search' : '/');
            });
          });
      } else {
        alert('Login Failed');
        this.router.navigateByUrl('/');
      }
    });
  }
}
