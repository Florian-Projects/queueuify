import { Injectable } from '@angular/core';
import { BehaviorSubject, fromEvent, interval } from 'rxjs';
import {
  PlaybackProgressViewModel,
  sessionQueue,
} from './session-manager.interfaces';
import { SessionService } from './session.service';
import { SpotifyTrack } from './song-search/song-search.service';

interface PlaybackAnchor {
  track: SpotifyTrack;
  isPlaying: boolean;
  baseProgressMs: number;
  durationMs: number | null;
  receivedAtMs: number;
}

@Injectable({
  providedIn: 'root',
})
export class PlaybackProgressService {
  private readonly stateSubject =
    new BehaviorSubject<PlaybackProgressViewModel>(this.createEmptyState());
  private anchor: PlaybackAnchor | null = null;

  readonly state$ = this.stateSubject.asObservable();

  constructor(private readonly sessionService: SessionService) {
    this.sessionService.queueState$.subscribe((queueState) => {
      this.applyQueueState(queueState);
    });

    interval(250).subscribe(() => {
      if (!this.anchor) {
        return;
      }

      this.emitFromAnchor();
    });

    if (typeof document !== 'undefined') {
      fromEvent(document, 'visibilitychange').subscribe(() => {
        this.emitFromAnchor();
      });
    }
  }

  private createEmptyState(): PlaybackProgressViewModel {
    return {
      track: null,
      isPlaying: false,
      elapsedMs: 0,
      durationMs: null,
      elapsedLabel: '00:00',
      durationLabel: '--:--',
      progressPercent: 0,
    };
  }

  private applyQueueState(queueState: sessionQueue | null): void {
    const track = queueState?.currently_playing ?? null;
    if (!track) {
      this.anchor = null;
      this.stateSubject.next(this.createEmptyState());
      return;
    }

    const normalizedProgressMs = Math.max(
      0,
      Math.round(queueState?.playback_status?.progress_ms ?? 0),
    );
    const durationMs =
      typeof track.duration_ms === 'number' ? track.duration_ms : null;

    this.anchor = {
      track,
      isPlaying: Boolean(queueState?.playback_status?.is_playing),
      baseProgressMs:
        durationMs === null
          ? normalizedProgressMs
          : Math.min(normalizedProgressMs, durationMs),
      durationMs,
      receivedAtMs: Date.now(),
    };

    this.emitFromAnchor();
  }

  private emitFromAnchor(): void {
    if (!this.anchor) {
      this.stateSubject.next(this.createEmptyState());
      return;
    }

    this.stateSubject.next(this.buildState(this.anchor));
  }

  private buildState(anchor: PlaybackAnchor): PlaybackProgressViewModel {
    const elapsedMs = this.currentElapsedMs(anchor);

    return {
      track: anchor.track,
      isPlaying: anchor.isPlaying,
      elapsedMs,
      durationMs: anchor.durationMs,
      elapsedLabel: this.formatTime(elapsedMs),
      durationLabel:
        anchor.durationMs === null ? '--:--' : this.formatTime(anchor.durationMs),
      progressPercent:
        anchor.durationMs && anchor.durationMs > 0
          ? Math.min((elapsedMs / anchor.durationMs) * 100, 100)
          : 0,
    };
  }

  private currentElapsedMs(anchor: PlaybackAnchor): number {
    let elapsedMs = anchor.baseProgressMs;

    if (anchor.isPlaying) {
      elapsedMs += Math.max(Date.now() - anchor.receivedAtMs, 0);
    }

    if (anchor.durationMs !== null) {
      elapsedMs = Math.min(elapsedMs, anchor.durationMs);
    }

    return Math.max(Math.round(elapsedMs), 0);
  }

  private formatTime(durationMs: number): string {
    const totalSeconds = Math.max(Math.floor(durationMs / 1000), 0);
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }
}
