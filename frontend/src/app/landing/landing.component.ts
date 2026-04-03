import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthMode, LoginService } from '../login.service';
import { SessionService } from '../session-manager/session.service';
import { sessionState } from '../session-manager/session-manager.interfaces';

type PendingAction = 'spotify' | 'anonymous' | 'create' | 'join' | 'logout' | null;

@Component({
  selector: 'app-landing',
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss'],
})
export class LandingComponent implements OnInit {
  protected readonly supportText =
    "By continuing, you agree to Queueify's editorial standards and data privacy layers.";

  protected loggedIn = false;
  protected authMode: AuthMode = null;
  protected sessionCode = '';
  protected errorMessage = '';
  protected pendingAction: PendingAction = null;
  protected sessionState: sessionState = {
    isInSession: false,
    sessionToken: null,
    isOwner: false,
  };

  constructor(
    private readonly router: Router,
    private readonly loginService: LoginService,
    private readonly sessionService: SessionService,
  ) {}

  ngOnInit(): void {
    this.loggedIn = this.loginService.loggedIn;
    this.authMode = this.loginService.getAuthMode();
    this.sessionState = this.sessionService.getSessionState();
    if (this.sessionState.isInSession) {
      this.router.navigateByUrl('/search');
    }

    this.loginService.loggedInChanged.subscribe((loggedIn: boolean) => {
      this.loggedIn = loggedIn;
      if (!loggedIn) {
        this.sessionCode = '';
      }
    });

    this.loginService.authModeChanged.subscribe((authMode: AuthMode) => {
      this.authMode = authMode;
    });

    this.sessionService.sessionChanged.subscribe((sessionState: sessionState) => {
      this.sessionState = sessionState;
      if (sessionState.isInSession) {
        this.router.navigateByUrl('/search');
      }
    });
  }

  protected get isLoggedOut(): boolean {
    return !this.loggedIn;
  }

  protected get isPreSession(): boolean {
    return this.loggedIn && !this.sessionState.isInSession;
  }

  protected get canHost(): boolean {
    return this.loginService.canHostSessions();
  }

  protected get headlineLead(): string {
    if (this.isLoggedOut) {
      return 'Your Social';
    }

    return this.canHost ? 'Join or Host the' : 'Join the';
  }

  protected get headlineAccent(): string {
    if (this.isLoggedOut) {
      return 'Music Core';
    }

    return this.canHost ? 'Session' : 'Listening Room';
  }

  protected get heroDescription(): string {
    if (this.isLoggedOut) {
      return 'Sync your queue, invite your circle, and experience music in high-fidelity obsidian depth.';
    }

    if (this.canHost) {
      return 'Enter a session code to join an active room, or host a new one from the same landing flow.';
    }

    if (this.authMode === 'unknown') {
      return 'Join with a session code now. Hosting requires a Spotify sign-in that the current backend can identify.';
    }

    return 'Anonymous users can join existing sessions with a code, but they cannot host.';
  }

  protected get eyebrow(): string {
    if (this.isLoggedOut) {
      return 'Pure Sonic Experience';
    }

    if (this.authMode === 'spotify') {
      return 'Spotify Connected';
    }

    if (this.authMode === 'anonymous') {
      return 'Anonymous Mode';
    }

    return 'Session Access';
  }

  protected get footerNote(): string {
    if (this.isLoggedOut) {
      return 'No credit card required. Free to host.';
    }

    if (this.canHost) {
      return 'Session codes are six-character alphanumeric codes and can be entered in any case.';
    }

    return 'Hosting is reserved for Spotify-authenticated users.';
  }

  protected get showHostAction(): boolean {
    return this.isPreSession && this.canHost;
  }

  protected get joinButtonLabel(): string {
    return this.pendingAction === 'join' ? 'Joining...' : 'Join Session';
  }

  protected get hostButtonLabel(): string {
    return this.pendingAction === 'create' ? 'Starting...' : 'Start Session';
  }

  protected get logoutButtonLabel(): string {
    return this.pendingAction === 'logout' ? 'Signing out...' : 'Log out';
  }

  protected get spotifyButtonLabel(): string {
    return this.pendingAction === 'spotify'
      ? 'Redirecting...'
      : 'Log in with Spotify';
  }

  protected get anonymousButtonLabel(): string {
    return this.pendingAction === 'anonymous'
      ? 'Joining...'
      : 'Join Anonymously';
  }

  protected get sidebarActionDisabled(): boolean {
    return this.pendingAction !== null;
  }

  protected onSessionCodeChange(value: string): void {
    this.sessionCode = this.sessionService.normalizeSessionToken(value);
    this.errorMessage = '';
  }

  protected onSidebarAction(): void {
    if (!this.loggedIn) {
      this.startSpotifyLogin();
      return;
    }

    if (this.canHost) {
      this.createSession();
      return;
    }

    this.errorMessage = 'Hosting requires a Spotify login.';
  }

  protected onPrimaryAction(): void {
    if (this.isLoggedOut) {
      this.startSpotifyLogin();
      return;
    }

    this.joinSession();
  }

  protected onSecondaryAction(): void {
    if (this.isLoggedOut) {
      this.startAnonymousLogin();
      return;
    }

    this.logout();
  }

  protected onCreateSession(): void {
    this.createSession();
  }

  protected onJoinSession(): void {
    this.joinSession();
  }

  private startSpotifyLogin(): void {
    this.pendingAction = 'spotify';
    this.errorMessage = '';
    this.loginService.login().subscribe({
      next: (response) => {
        window.open(response.authorization_url, '_self');
      },
      error: () => {
        this.pendingAction = null;
      },
    });
  }

  private startAnonymousLogin(): void {
    this.pendingAction = 'anonymous';
    this.errorMessage = '';
    this.loginService.loginAnonymous().subscribe({
      next: () => {
        this.pendingAction = null;
        this.sessionService.resetSessionState();
      },
      error: () => {
        this.pendingAction = null;
      },
    });
  }

  private createSession(): void {
    if (!this.canHost) {
      this.errorMessage = 'Hosting requires a Spotify login.';
      return;
    }

    this.pendingAction = 'create';
    this.errorMessage = '';
    this.sessionService.createSessionRequest().subscribe({
      next: () => {
        this.pendingAction = null;
        this.router.navigateByUrl('/search');
      },
      error: (error) => {
        this.handleActionError(error, 'Could not start the session.');
      },
    });
  }

  private joinSession(): void {
    const normalizedCode = this.sessionService.normalizeSessionToken(
      this.sessionCode,
    );

    if (normalizedCode.length !== 6) {
      this.errorMessage = 'Enter the 6-character session code.';
      return;
    }

    this.pendingAction = 'join';
    this.errorMessage = '';
    this.sessionCode = normalizedCode;
    this.sessionService.joinSessionRequest(normalizedCode).subscribe({
      next: () => {
        this.pendingAction = null;
        this.router.navigateByUrl('/search');
      },
      error: (error) => {
        this.handleActionError(error, 'Could not join that session.');
      },
    });
  }

  private logout(): void {
    this.pendingAction = 'logout';
    this.errorMessage = '';
    this.loginService.logout().subscribe({
      next: () => {
        this.clearClientState();
      },
      error: (error) => {
        if (error.status === 403) {
          this.clearClientState();
          return;
        }

        this.handleActionError(error, 'Could not sign out.');
      },
    });
  }

  private clearClientState(): void {
    this.loginService.clearClientSession();
    this.sessionService.resetSessionState();
    this.pendingAction = null;
    this.errorMessage = '';
  }

  private handleActionError(error: any, fallbackMessage: string): void {
    const detail =
      error?.error?.detail ?? error?.error?.details ?? fallbackMessage;
    this.errorMessage = String(detail);
    this.pendingAction = null;
  }
}
