import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { fromEvent, interval } from 'rxjs';
import {
  PlaybackProgressViewModel,
  sessionQueue,
  sessionState,
} from '../session-manager/session-manager.interfaces';
import { PlaybackProgressService } from '../session-manager/playback-progress.service';
import { SessionService } from '../session-manager/session.service';
import { SpotifyTrack } from '../session-manager/song-search/song-search.service';

interface SessionNavItem {
  label: string;
  icon: string;
  route: string;
  enabled: boolean;
  hostOnly?: boolean;
}

@Component({
  selector: 'app-session-shell',
  templateUrl: './session-shell.component.html',
  styleUrls: ['./session-shell.component.scss'],
})
export class SessionShellComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  protected isLoadingSession = true;
  protected sessionState: sessionState = {
    isInSession: false,
    sessionToken: null,
    isOwner: false,
  };
  protected currentTrack: SpotifyTrack | null = null;
  protected isPlaying = false;
  protected canControlPlayback = false;
  protected playbackProgress: PlaybackProgressViewModel = {
    track: null,
    isPlaying: false,
    elapsedMs: 0,
    durationMs: null,
    elapsedLabel: '00:00',
    durationLabel: '--:--',
    progressPercent: 0,
  };
  protected playbackControlPending:
    | 'pause'
    | 'resume'
    | 'next'
    | 'previous'
    | null = null;

  private readonly navItems: SessionNavItem[] = [
    { label: 'Session', icon: 'dashboard', route: '/session', enabled: true },
    { label: 'Search', icon: 'search', route: '/search', enabled: true },
    { label: 'Queue', icon: 'queue_music', route: '/queue', enabled: true },
    {
      label: 'Member',
      icon: 'group',
      route: '/member',
      enabled: true,
      hostOnly: true,
    },
  ];

  constructor(
    private readonly router: Router,
    private readonly sessionService: SessionService,
    private readonly playbackProgressService: PlaybackProgressService,
  ) {}

  ngOnInit(): void {
    if (!localStorage.getItem('session_key')) {
      this.router.navigateByUrl('/');
      return;
    }

    this.sessionState = this.sessionService.getSessionState();
    this.isLoadingSession = !this.sessionState.isInSession;

    this.playbackProgressService.state$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((playbackProgress) => {
        this.playbackProgress = playbackProgress;
      });

    this.sessionService.sessionChanged
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((sessionState: sessionState) => {
        this.sessionState = sessionState;
        this.isLoadingSession = false;

        if (!sessionState.isInSession) {
          this.router.navigateByUrl('/');
          return;
        }

        this.loadPlaybackState();
      });

    interval(15000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!this.sessionState.isInSession) {
          return;
        }

        this.sessionService.fetchSessionState();
      });

    interval(5000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!this.sessionState.isInSession || this.isDocumentHidden()) {
          return;
        }

        this.loadPlaybackState();
      });

    if (typeof document !== 'undefined') {
      fromEvent(document, 'visibilitychange')
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          if (!this.sessionState.isInSession || this.isDocumentHidden()) {
            return;
          }

          this.loadPlaybackState();
        });
    }

    if (this.sessionState.isInSession) {
      const cachedQueueState = this.sessionService.getCurrentQueueState();
      if (cachedQueueState) {
        this.applyQueueState(cachedQueueState);
      }

      this.loadPlaybackState();
    }
  }

  protected get visibleNavItems(): SessionNavItem[] {
    return this.navItems.filter(
      (navItem) => !navItem.hostOnly || this.sessionState.isOwner,
    );
  }

  protected get currentTrackArtistLine(): string {
    return this.currentTrack?.artists?.map((artist) => artist.name).join(' • ') ?? '';
  }

  protected onSelectNavItem(navItem: SessionNavItem): void {
    if (!navItem.enabled) {
      return;
    }

    this.router.navigateByUrl(navItem.route);
  }

  protected isActiveNavItem(navItem: SessionNavItem): boolean {
    return this.router.url === navItem.route;
  }

  protected onTogglePlayback(): void {
    if (!this.currentTrack || !this.canControlPlayback || this.playbackControlPending) {
      return;
    }

    if (this.isPlaying) {
      this.runPlaybackControl('pause');
      return;
    }

    this.runPlaybackControl('resume');
  }

  protected onSkipPrevious(): void {
    if (!this.currentTrack || !this.canControlPlayback || this.playbackControlPending) {
      return;
    }

    this.runPlaybackControl('previous');
  }

  protected onSkipNext(): void {
    if (!this.currentTrack || !this.canControlPlayback || this.playbackControlPending) {
      return;
    }

    this.runPlaybackControl('next');
  }

  protected isPlaybackActionPending(action: 'pause' | 'resume' | 'next' | 'previous'): boolean {
    return this.playbackControlPending === action;
  }

  private runPlaybackControl(action: 'pause' | 'resume' | 'next' | 'previous'): void {
    this.playbackControlPending = action;

    const request$ =
      action === 'pause'
        ? this.sessionService.pausePlaybackRequest()
        : action === 'resume'
          ? this.sessionService.resumePlaybackRequest()
          : action === 'next'
            ? this.sessionService.skipToNextRequest()
            : this.sessionService.skipToPreviousRequest();

    request$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (queueResponse) => {
          this.applyQueueState(queueResponse);
          this.playbackControlPending = null;
        },
        error: () => {
          this.playbackControlPending = null;
          this.loadPlaybackState();
        },
      });
  }

  private loadPlaybackState(): void {
    this.sessionService
      .getQueue()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (queueResponse) => {
          this.applyQueueState(queueResponse);
        },
        error: () => {
          this.currentTrack = null;
          this.isPlaying = false;
          this.canControlPlayback = false;
        },
      });
  }

  private applyQueueState(queueResponse: sessionQueue): void {
    this.currentTrack = queueResponse.currently_playing ?? null;
    this.isPlaying = Boolean(queueResponse.playback_status?.is_playing);
    this.canControlPlayback = Boolean(
      this.sessionState.isOwner &&
        queueResponse.capabilities?.can_control_playback &&
        !queueResponse.playback_status?.dispatch_block_reason,
    );
  }

  private isDocumentHidden(): boolean {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
  }
}
