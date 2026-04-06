import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import * as QRCode from 'qrcode';
import {
  SessionPlaybackTargetStatus,
  SessionSettingsResponse,
  SessionSettingsUpdateRequest,
  sessionState,
} from '../session-manager/session-manager.interfaces';
import { SessionService } from '../session-manager/session.service';

@Component({
  selector: 'app-session-route',
  templateUrl: './session-route.component.html',
  styleUrls: ['./session-route.component.scss'],
})
export class SessionRouteComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private lastSessionKey: string | null = null;

  protected sessionState: sessionState = {
    isInSession: false,
    sessionToken: null,
    isOwner: false,
    sessionType: 'host_only',
    playbackBackend: 'spotify_host',
    disallowAnonymousUsers: false,
    explicitFilter: false,
  };
  protected settings: SessionSettingsResponse | null = null;
  protected feedbackMessage = '';
  protected settingsFeedback = '';
  protected settingsError = '';
  protected isLoadingSettings = false;
  protected isSavingSettings = false;
  protected qrCodeDataUrl = '';

  constructor(private readonly sessionService: SessionService) {}

  ngOnInit(): void {
    this.sessionState = this.sessionService.getSessionState();
    this.sessionService.sessionChanged
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((sessionState: sessionState) => {
        const previousSessionKey = this.lastSessionKey;
        this.sessionState = sessionState;
        this.lastSessionKey = this.buildSessionKey(sessionState);
        this.refreshQrCode();

        if (!sessionState.isOwner) {
          this.settings = null;
          this.isLoadingSettings = false;
          return;
        }

        if (previousSessionKey !== this.lastSessionKey) {
          this.loadSettings();
        }
      });

    if (this.sessionState.isOwner) {
      this.lastSessionKey = this.buildSessionKey(this.sessionState);
      this.loadSettings();
    }

    this.refreshQrCode();
  }

  protected get sessionCode(): string {
    return this.sessionState.sessionToken ?? '------';
  }

  protected get primaryActionLabel(): string {
    return this.sessionState.isOwner ? 'End Session' : 'Leave Session';
  }

  protected get sessionJoinUrl(): string {
    if (!this.sessionState.sessionToken) {
      return '';
    }

    return `${window.location.origin}/?join=${encodeURIComponent(this.sessionState.sessionToken)}`;
  }

  protected get playbackTargetLabel(): string {
    return this.currentSessionType === 'everyone' ? 'Everyone' : 'Host Only';
  }

  protected get joinAccessLabel(): string {
    return this.currentDisallowAnonymousUsers ? 'Spotify only' : 'Guests allowed';
  }

  protected get currentSessionType(): 'host_only' | 'everyone' {
    return this.settings?.session_type ?? this.sessionState.sessionType ?? 'host_only';
  }

  protected get currentDisallowAnonymousUsers(): boolean {
    return (
      this.settings?.disallow_anonymous_users ??
      this.sessionState.disallowAnonymousUsers ??
      false
    );
  }

  protected get currentExplicitFilter(): boolean {
    return this.settings?.explicit_filter ?? this.sessionState.explicitFilter ?? false;
  }

  protected get everyoneModeDisabled(): boolean {
    return !this.currentDisallowAnonymousUsers;
  }

  protected get everyoneModeTooltip(): string {
    if (!this.everyoneModeDisabled) {
      return '';
    }

    return 'Enable Disallow anonymous users to enable Everyone mode.';
  }

  protected get everyoneSummary(): string {
    return (
      this.settings?.everyone_playback_status.status_message ??
      'Everyone playback is unavailable until the host saves the room settings.'
    );
  }

  protected sessionTypeLabel(sessionType: 'host_only' | 'everyone'): string {
    return sessionType === 'everyone' ? 'Everyone' : 'Host Only';
  }

  protected syncStateLabel(member: SessionPlaybackTargetStatus): string {
    switch (member.sync_state) {
      case 'synced':
        return 'Synced';
      case 'ready':
        return 'Ready';
      case 'paused':
        return 'Paused';
      case 'wrong_track':
        return 'Wrong Track';
      case 'wrong_position':
        return 'Wrong Position';
      case 'restricted_device':
        return 'Restricted';
      case 'no_active_device':
        return 'No device';
      case 'no_spotify_session':
        return 'Re-login';
      case 'anonymous_user':
        return 'Guest';
      default:
        return 'Unavailable';
    }
  }

  protected syncStateClass(member: SessionPlaybackTargetStatus): string {
    switch (member.sync_state) {
      case 'synced':
        return 'session-route__sync-pill--synced';
      case 'ready':
        return 'session-route__sync-pill--ready';
      case 'wrong_track':
      case 'wrong_position':
        return 'session-route__sync-pill--warning';
      default:
        return 'session-route__sync-pill--muted';
    }
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

  protected async onCopySessionLink(): Promise<void> {
    if (!this.sessionJoinUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(this.sessionJoinUrl);
      this.feedbackMessage = 'Session link copied.';
    } catch {
      this.feedbackMessage = 'Clipboard access is unavailable in this browser.';
    }
  }

  protected async onShareSessionLink(): Promise<void> {
    if (!this.sessionJoinUrl) {
      return;
    }

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'Queueify Session Link',
          url: this.sessionJoinUrl,
        });
        this.feedbackMessage = 'Share sheet opened.';
        return;
      } catch {
        this.feedbackMessage = 'Share was cancelled.';
        return;
      }
    }

    await this.onCopySessionLink();
  }

  protected async onShareSessionCode(): Promise<void> {
    if (!this.sessionState.sessionToken) {
      return;
    }

    const shareText = `Join my Queueify session with code ${this.sessionState.sessionToken}`;
    const joinUrl = this.sessionJoinUrl;

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'Queueify Session',
          text: shareText,
          url: joinUrl,
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

  protected onToggleDisallowAnonymousUsers(nextValue: boolean): void {
    this.saveSettings(
      { disallow_anonymous_users: nextValue },
      nextValue
        ? 'Guest users were removed and future guest joins are blocked.'
        : 'Anonymous users can join this session again.',
    );
  }

  protected onSetSessionType(nextValue: 'host_only' | 'everyone'): void {
    if (
      nextValue === 'everyone' &&
      !this.currentDisallowAnonymousUsers
    ) {
      this.settingsError =
        'Enable Disallow anonymous users before switching to Everyone mode.';
      this.settingsFeedback = '';
      return;
    }

    this.saveSettings(
      { session_type: nextValue },
      nextValue === 'everyone'
        ? 'Playback will now target every joined Spotify member device that is ready.'
        : 'Playback is now targeted to the host device only.',
    );
  }

  protected onToggleExplicitFilter(nextValue: boolean): void {
    this.saveSettings(
      { explicit_filter: nextValue },
      nextValue
        ? 'Explicit tracks are now blocked from entering the room queue.'
        : 'Explicit tracks can be queued again.',
    );
  }

  private loadSettings(): void {
    if (!this.sessionState.isOwner || !this.sessionState.sessionToken) {
      return;
    }

    this.isLoadingSettings = true;
    this.settingsError = '';
    this.sessionService
      .getSessionSettingsRequest()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this.settings = settings;
          this.isLoadingSettings = false;
        },
        error: (error) => {
          this.settings = null;
          this.settingsError =
            error?.error?.detail ??
            error?.error?.details ??
            'Room settings are currently unavailable.';
          this.isLoadingSettings = false;
        },
      });
  }

  private saveSettings(
    body: SessionSettingsUpdateRequest,
    successMessage: string,
  ): void {
    if (this.isSavingSettings) {
      return;
    }

    this.isSavingSettings = true;
    this.settingsError = '';
    this.settingsFeedback = '';

    this.sessionService
      .updateSessionSettingsRequest(body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this.settings = settings;
          this.settingsFeedback = successMessage;
          this.isSavingSettings = false;
        },
        error: (error) => {
          this.settingsError =
            error?.error?.detail ??
            error?.error?.details ??
            'Could not save those room settings.';
          this.isSavingSettings = false;
        },
      });
  }

  private buildSessionKey(state: sessionState): string | null {
    if (!state.isInSession || !state.sessionToken) {
      return null;
    }

    return `${state.sessionToken}:${state.isOwner ? 'owner' : 'member'}`;
  }

  private async refreshQrCode(): Promise<void> {
    if (!this.sessionState.sessionToken) {
      this.qrCodeDataUrl = '';
      return;
    }

    try {
      this.qrCodeDataUrl = await QRCode.toDataURL(this.sessionJoinUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 280,
        color: {
          dark: '#f9fafb',
          light: '#0f131a',
        },
      });
    } catch {
      this.qrCodeDataUrl = '';
    }
  }
}
