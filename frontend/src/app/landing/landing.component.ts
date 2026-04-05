import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
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
  private readonly destroyRef = inject(DestroyRef);
  private pendingJoinCodeFromLink: string | null = null;
  private attemptedAutoJoinCode: string | null = null;

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
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly loginService: LoginService,
    private readonly sessionService: SessionService,
  ) {}

  ngOnInit(): void {
    this.loggedIn = this.loginService.loggedIn;
    this.authMode = this.loginService.getAuthMode();
    this.sessionState = this.sessionService.getSessionState();

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const rawJoinCode = params.get('join');
        const joinError = params.get('joinError');
        const normalizedJoinCode = rawJoinCode
          ? this.sessionService.normalizeSessionToken(rawJoinCode)
          : '';
        const nextJoinCode =
          normalizedJoinCode.length === 6 ? normalizedJoinCode : null;

        if (this.pendingJoinCodeFromLink !== nextJoinCode) {
          this.attemptedAutoJoinCode = null;
        }

        this.pendingJoinCodeFromLink = nextJoinCode;

        if (rawJoinCode && !nextJoinCode) {
          this.loginService.clearPendingJoinCode();
          this.errorMessage = 'The session link is invalid.';
          return;
        }

        if (nextJoinCode) {
          this.loginService.setPendingJoinCode(nextJoinCode);
          this.sessionCode = nextJoinCode;
        } else {
          this.loginService.clearPendingJoinCode();
        }

        if (joinError) {
          this.errorMessage = joinError;
          this.pendingAction = null;
          this.attemptedAutoJoinCode = nextJoinCode;
          return;
        }

        if (!this.pendingAction) {
          this.errorMessage = '';
        }

        this.maybeHandlePendingJoin();
      });

    if (this.loggedIn) {
      this.loginService
        .bootstrapCurrentUser()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.resolveCurrentSessionState();
          },
          error: () => {
            this.resolveCurrentSessionState();
          },
        });
    } else {
      this.handleResolvedSessionState(this.sessionState);
    }

    this.loginService.loggedInChanged
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((loggedIn: boolean) => {
        this.loggedIn = loggedIn;
        if (!loggedIn) {
          this.sessionCode = this.pendingJoinCodeFromLink ?? '';
          this.sessionState = {
            isInSession: false,
            sessionToken: null,
            isOwner: false,
          };
          return;
        }

        this.resolveCurrentSessionState();
      });

    this.loginService.authModeChanged
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((authMode: AuthMode) => {
        this.authMode = authMode;
      });

    this.sessionService.sessionChanged
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((sessionState: sessionState) => {
        this.sessionState = sessionState;
        if (sessionState.isInSession) {
          if (this.pendingJoinCodeFromLink) {
            if (sessionState.sessionToken === this.pendingJoinCodeFromLink) {
              this.clearPendingJoinIntent();
              this.pendingAction = null;
              this.router.navigateByUrl('/search');
              return;
            }

            this.clearPendingJoinIntent(false);
            this.errorMessage =
              'Leave your current session before joining a different room.';
            this.pendingAction = null;
            return;
          }

          const targetRoute =
            this.pendingAction === 'create' ? '/session' : '/search';
          this.pendingAction = null;
          this.router.navigateByUrl(targetRoute);
          return;
        }

        this.maybeHandlePendingJoin();
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
      return 'Shared Music Sessions';
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
    this.persistJoinIntent();
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
    this.persistJoinIntent();
    this.loginService.loginAnonymous().subscribe({
      next: () => {
        this.sessionService.resetSessionState();
        const pendingJoinCode = this.getActiveJoinIntentCode();
        if (pendingJoinCode) {
          this.joinSession(pendingJoinCode, true);
          return;
        }

        this.pendingAction = null;
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

    this.clearPendingJoinIntent(false);
    this.pendingAction = 'create';
    this.errorMessage = '';
    this.sessionService.createSessionRequest().subscribe({
      next: () => {
        return;
      },
      error: (error) => {
        this.handleActionError(error, 'Could not start the session.');
      },
    });
  }

  private joinSession(sessionCode = this.sessionCode, isAutomatic = false): void {
    const normalizedCode = this.sessionService.normalizeSessionToken(sessionCode);

    if (normalizedCode.length !== 6) {
      this.errorMessage = 'Enter the 6-character session code.';
      return;
    }

    if (!isAutomatic) {
      this.clearPendingJoinIntent(false);
    } else {
      this.loginService.setPendingJoinCode(normalizedCode);
      this.attemptedAutoJoinCode = normalizedCode;
    }

    this.pendingAction = 'join';
    this.errorMessage = '';
    this.sessionCode = normalizedCode;
    this.sessionService.joinSessionRequest(normalizedCode).subscribe({
      next: () => {
        return;
      },
      error: (error) => {
        if (isAutomatic) {
          this.loginService.clearPendingJoinCode();
        }
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

  private resolveCurrentSessionState(): void {
    this.sessionService
      .fetchSessionStateRequest()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sessionState) => {
          this.handleResolvedSessionState(sessionState);
        },
        error: () => {
          this.handleResolvedSessionState({
            isInSession: false,
            sessionToken: null,
            isOwner: false,
          });
        },
      });
  }

  private handleResolvedSessionState(sessionState: sessionState): void {
    this.sessionState = sessionState;
    if (sessionState.isInSession) {
      if (!this.pendingJoinCodeFromLink) {
        this.router.navigateByUrl('/search');
        return;
      }

      if (sessionState.sessionToken === this.pendingJoinCodeFromLink) {
        this.clearPendingJoinIntent();
        this.router.navigateByUrl('/search');
        return;
      }

      this.clearPendingJoinIntent(false);
      this.errorMessage =
        'Leave your current session before joining a different room.';
      return;
    }

    this.maybeHandlePendingJoin();
  }

  private maybeHandlePendingJoin(): void {
    if (
      !this.pendingJoinCodeFromLink ||
      !this.loggedIn ||
      this.pendingAction !== null ||
      this.sessionState.isInSession
    ) {
      return;
    }

    if (this.attemptedAutoJoinCode === this.pendingJoinCodeFromLink) {
      return;
    }

    this.joinSession(this.pendingJoinCodeFromLink, true);
  }

  private getActiveJoinIntentCode(): string | null {
    const typedCode = this.sessionService.normalizeSessionToken(this.sessionCode);
    if (typedCode.length === 6) {
      return typedCode;
    }

    if (this.pendingJoinCodeFromLink) {
      return this.pendingJoinCodeFromLink;
    }

    const storedCode = this.loginService.getPendingJoinCode();
    if (!storedCode) {
      return null;
    }

    const normalizedStoredCode = this.sessionService.normalizeSessionToken(storedCode);
    return normalizedStoredCode.length === 6 ? normalizedStoredCode : null;
  }

  private persistJoinIntent(): void {
    const joinIntentCode = this.getActiveJoinIntentCode();
    if (joinIntentCode) {
      this.loginService.setPendingJoinCode(joinIntentCode);
    }
  }

  private clearPendingJoinIntent(clearInput = true): void {
    this.loginService.clearPendingJoinCode();
    this.pendingJoinCodeFromLink = null;
    this.attemptedAutoJoinCode = null;
    if (!clearInput) {
      return;
    }

    this.sessionCode = '';
  }

  private handleActionError(error: any, fallbackMessage: string): void {
    const detail =
      error?.error?.detail ?? error?.error?.details ?? fallbackMessage;
    this.errorMessage = String(detail);
    this.pendingAction = null;
  }
}
