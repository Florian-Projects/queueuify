import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoginService } from '../login.service';
import { SessionService } from '../session-manager/session.service';

@Component({
  selector: 'app-oauth-callback',
  templateUrl: './oauth-callback.component.html',
  styleUrls: ['./oauth-callback.component.scss'],
})
export class OauthCallbackComponent implements OnInit {
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private loginService: LoginService,
    private sessionService: SessionService,
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      const code = params['code'];
      const state = params['state'];
      if (!code || state !== this.loginService.getState()) {
        alert('Login Failed');
        this.router.navigateByUrl('/');
        return;
      }

      this.loginService.completeSpotifyLogin(code, state).subscribe({
        next: () => {
          this.sessionService.fetchSessionStateRequest().subscribe((sessionState) => {
            this.router.navigateByUrl(sessionState.isInSession ? '/search' : '/');
          });
        },
        error: () => {
          this.router.navigateByUrl('/');
        },
      });
    });
  }
}
