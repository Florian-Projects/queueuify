import { Component, OnInit } from '@angular/core';
import { SessionService } from '../session-manager/session.service';
import { sessionState } from '../session-manager/session-manager.interfaces';

@Component({
  selector: 'app-session-route',
  templateUrl: './session-route.component.html',
  styleUrls: ['./session-route.component.scss'],
})
export class SessionRouteComponent implements OnInit {
  protected sessionState: sessionState = {
    isInSession: false,
    sessionToken: null,
    isOwner: false,
  };
  protected feedbackMessage = '';

  constructor(private readonly sessionService: SessionService) {}

  ngOnInit(): void {
    this.sessionState = this.sessionService.getSessionState();
    this.sessionService.sessionChanged.subscribe((sessionState: sessionState) => {
      this.sessionState = sessionState;
    });
  }

  protected get sessionCode(): string {
    return this.sessionState.sessionToken ?? '------';
  }

  protected get primaryActionLabel(): string {
    return this.sessionState.isOwner ? 'End Session' : 'Leave Session';
  }

  protected async onCopySessionCode(): Promise<void> {
    if (!this.sessionState.sessionToken) {
      return;
    }

    try {
      await navigator.clipboard.writeText(this.sessionState.sessionToken);
      this.feedbackMessage = 'Session code copied.';
    } catch {
      this.feedbackMessage = 'Clipboard access is unavailable in this browser.';
    }
  }

  protected async onShareSessionCode(): Promise<void> {
    if (!this.sessionState.sessionToken) {
      return;
    }

    const shareText = `Join my Queueify session with code ${this.sessionState.sessionToken}`;

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'Queueify Session',
          text: shareText,
        });
        this.feedbackMessage = 'Share sheet opened.';
        return;
      } catch {
        this.feedbackMessage = 'Share was cancelled.';
        return;
      }
    }

    await this.onCopySessionCode();
  }

  protected onExitSession(): void {
    this.feedbackMessage = '';

    if (this.sessionState.isOwner) {
      this.sessionService.deleteSession();
      return;
    }

    if (this.sessionState.sessionToken) {
      this.sessionService.leaveSession(this.sessionState.sessionToken);
    }
  }
}
