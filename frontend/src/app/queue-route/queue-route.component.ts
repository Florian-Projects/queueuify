import { Component, OnInit } from '@angular/core';
import {
  sessionQueue,
  sessionState,
} from '../session-manager/session-manager.interfaces';
import { SessionService } from '../session-manager/session.service';
import { SpotifyTrack } from '../session-manager/song-search/song-search.service';

@Component({
  selector: 'app-queue-route',
  templateUrl: './queue-route.component.html',
  styleUrls: ['./queue-route.component.scss'],
})
export class QueueRouteComponent implements OnInit {
  protected sessionState: sessionState = {
    isInSession: false,
    sessionToken: null,
    isOwner: false,
  };
  protected queueResponse: sessionQueue | null = null;
  protected isLoading = true;
  protected error = '';

  constructor(private readonly sessionService: SessionService) {}

  ngOnInit(): void {
    this.sessionState = this.sessionService.getSessionState();
    this.sessionService.sessionChanged.subscribe((sessionState: sessionState) => {
      this.sessionState = sessionState;

      if (sessionState.isInSession && sessionState.sessionToken) {
        this.loadQueue();
      }
    });

    if (this.sessionState.isInSession && this.sessionState.sessionToken) {
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

  protected trackArtistLine(track: SpotifyTrack): string {
    return track.artists.map((artist) => artist.name).join(' • ');
  }

  protected refreshQueue(): void {
    this.loadQueue();
  }

  private loadQueue(): void {
    this.error = '';
    this.isLoading = true;

    try {
      this.sessionService.getQueue().subscribe({
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
