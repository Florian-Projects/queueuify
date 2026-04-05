import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  PlaybackProgressViewModel,
  QueueItem,
  QueueTrackProjection,
  sessionQueue,
  sessionState,
} from '../session-manager/session-manager.interfaces';
import { PlaybackProgressService } from '../session-manager/playback-progress.service';
import { SessionService } from '../session-manager/session.service';
import { SpotifyTrack } from '../session-manager/song-search/song-search.service';

@Component({
  selector: 'app-queue-route',
  templateUrl: './queue-route.component.html',
  styleUrls: ['./queue-route.component.scss'],
})
export class QueueRouteComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  protected sessionState: sessionState = {
    isInSession: false,
    sessionToken: null,
    isOwner: false,
  };
  protected queueResponse: sessionQueue | null = null;
  protected isLoading = true;
  protected error = '';
  protected readonly busyItemIds = new Set<number>();
  protected playbackProgress: PlaybackProgressViewModel = {
    track: null,
    isPlaying: false,
    elapsedMs: 0,
    durationMs: null,
    elapsedLabel: '00:00',
    durationLabel: '--:--',
    progressPercent: 0,
  };

  constructor(
    private readonly sessionService: SessionService,
    private readonly playbackProgressService: PlaybackProgressService,
  ) {}

  ngOnInit(): void {
    this.sessionState = this.sessionService.getSessionState();
    this.playbackProgressService.state$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((playbackProgress) => {
        this.playbackProgress = playbackProgress;
      });

    this.sessionService.queueState$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((queueResponse) => {
        if (!queueResponse) {
          return;
        }

        this.queueResponse = queueResponse;
        this.isLoading = false;
      });

    this.sessionService.sessionChanged
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((sessionState: sessionState) => {
        this.sessionState = sessionState;

        if (sessionState.isInSession && sessionState.sessionToken) {
          this.loadQueue();
        }
      });

    if (this.sessionState.isInSession && this.sessionState.sessionToken) {
      const cachedQueueState = this.sessionService.getCurrentQueueState();
      if (cachedQueueState) {
        this.queueResponse = cachedQueueState;
        this.isLoading = false;
        return;
      }

      this.loadQueue();
      return;
    }

    this.isLoading = false;
  }

  protected get currentTrack(): SpotifyTrack | null {
    return this.queueResponse?.currently_playing ?? null;
  }

  protected get queuedTracks(): SpotifyTrack[] {
    return this.queueResponse?.queue ?? [];
  }

  protected get queueItems(): QueueItem[] {
    return this.queueResponse?.queue_items ?? [];
  }

  protected get externalItems(): QueueTrackProjection[] {
    return this.queueResponse?.external_items ?? [];
  }

  protected get playbackBlockMessage(): string {
    const reason = this.queueResponse?.playback_status?.dispatch_block_reason;
    switch (reason) {
      case 'no_active_device':
        return 'The host has no active Spotify device. New room tracks are stored and will sync later.';
      case 'no_active_playback':
        return 'The host is not actively playing music. New room tracks are stored and will sync later.';
      case 'restricted_device':
        return 'The host device is restricted. Playback control is temporarily unavailable.';
      case 'no_ready_member_device':
        return 'No joined Spotify member currently has a controllable device. Room tracks will stay queued until someone activates Spotify playback.';
      default:
        return '';
    }
  }

  protected trackArtistLine(track: SpotifyTrack): string {
    return track.artists.map((artist) => artist.name).join(' • ');
  }

  protected refreshQueue(): void {
    this.loadQueue();
  }

  protected onPlayNow(item: QueueItem): void {
    if (this.busyItemIds.has(item.id)) {
      return;
    }

    this.busyItemIds.add(item.id);
    this.error = '';
    this.sessionService.playQueueItemNowRequest(item.id).subscribe({
      next: (queueResponse) => {
        this.queueResponse = queueResponse;
        this.busyItemIds.delete(item.id);
      },
      error: (error) => {
        this.busyItemIds.delete(item.id);
        this.error =
          error?.error?.detail ??
          error?.error?.details ??
          'Could not start playback.';
      },
    });
  }

  protected onRemove(item: QueueItem): void {
    if (this.busyItemIds.has(item.id)) {
      return;
    }

    this.busyItemIds.add(item.id);
    this.error = '';
    this.sessionService.removeQueueItemRequest(item.id).subscribe({
      next: (queueResponse) => {
        this.queueResponse = queueResponse;
        this.busyItemIds.delete(item.id);
      },
      error: (error) => {
        this.busyItemIds.delete(item.id);
        this.error =
          error?.error?.detail ??
          error?.error?.details ??
          'Could not remove that track.';
      },
    });
  }

  protected isBusy(item: QueueItem): boolean {
    return this.busyItemIds.has(item.id);
  }

  private loadQueue(): void {
    this.error = '';
    this.isLoading = true;

    try {
      this.sessionService
        .getQueue()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (queueResponse) => {
            this.queueResponse = queueResponse;
            this.isLoading = false;
          },
          error: (error) => {
            this.queueResponse = null;
            this.error =
              error?.error?.detail ??
              error?.error?.details ??
              'Queue data is currently unavailable.';
            this.isLoading = false;
          },
        });
    } catch (error: any) {
      this.error = error?.message ?? 'Queue data is currently unavailable.';
      this.isLoading = false;
    }
  }
}
