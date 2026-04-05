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
          const pendingJoinCode = this.normalizePendingJoinCode();
          this.sessionService.fetchSessionStateRequest().subscribe({
            next: (sessionState) => {
              if (!pendingJoinCode) {
                this.router.navigateByUrl(sessionState.isInSession ? '/search' : '/');
                return;
              }

              if (sessionState.isInSession) {
                if (sessionState.sessionToken === pendingJoinCode) {
                  this.loginService.clearPendingJoinCode();
                  this.router.navigateByUrl('/search');
                  return;
                }

                this.redirectToLandingWithError(
                  pendingJoinCode,
                  'Leave your current session before joining a different room.',
                );
                return;
              }

              this.sessionService.joinSessionRequest(pendingJoinCode).subscribe({
                next: () => {
                  this.loginService.clearPendingJoinCode();
                  this.router.navigateByUrl('/search');
                },
                error: (error) => {
                  this.redirectToLandingWithError(
                    pendingJoinCode,
                    this.extractErrorMessage(
                      error,
                      'Could not join that session.',
                    ),
                  );
                },
              });
            },
            error: (error) => {
              if (!pendingJoinCode) {
                this.router.navigateByUrl('/');
                return;
              }

              this.redirectToLandingWithError(
                pendingJoinCode,
                this.extractErrorMessage(
                  error,
                  'Could not restore your session after login.',
                ),
              );
            },
          });
        },
        error: () => {
          this.router.navigateByUrl('/');
        },
      });
    });
  }

  private normalizePendingJoinCode(): string | null {
    const pendingJoinCode = this.loginService.getPendingJoinCode();
    if (!pendingJoinCode) {
      return null;
    }

    const normalizedCode = this.sessionService.normalizeSessionToken(pendingJoinCode);
    return normalizedCode.length === 6 ? normalizedCode : null;
  }

  private redirectToLandingWithError(joinCode: string, message: string): void {
    this.loginService.clearPendingJoinCode();
    this.router.navigate(['/'], {
      queryParams: {
        join: joinCode,
        joinError: message,
      },
    });
  }

  private extractErrorMessage(error: any, fallbackMessage: string): string {
    return (
      error?.error?.detail ??
      error?.error?.details ??
      fallbackMessage
    );
  }
}
