import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  BehaviorSubject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  switchMap,
} from 'rxjs';
import { sessionState } from '../session-manager/session-manager.interfaces';
import { SessionService } from '../session-manager/session.service';
import {
  SongSearchService,
  SpotifyTrack,
} from '../session-manager/song-search/song-search.service';

@Component({
  selector: 'app-search-route',
  templateUrl: './search-route.component.html',
  styleUrls: ['./search-route.component.scss'],
})
export class SearchRouteComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  protected query = '';
  protected sessionState: sessionState = {
    isInSession: false,
    sessionToken: null,
    isOwner: false,
  };
  protected results: SpotifyTrack[] = [];
  protected isLoadingResults = true;
  protected searchError = '';
  protected queueError = '';
  protected queueFeedback = '';
  protected readonly addingTrackUris = new Set<string>();
  protected readonly addedTrackUris = new Set<string>();
  protected readonly playingTrackUris = new Set<string>();

  private readonly query$ = new BehaviorSubject('');

  constructor(
    private readonly searchService: SongSearchService,
    private readonly sessionService: SessionService,
  ) {}

  ngOnInit(): void {
    this.sessionState = this.sessionService.getSessionState();
    this.sessionService.sessionChanged
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((sessionState: sessionState) => {
        this.sessionState = sessionState;
      });

    this.query$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((query) => {
          const normalizedQuery = query.trim();
          this.searchError = '';
          this.addedTrackUris.clear();

          if (!normalizedQuery) {
            this.isLoadingResults = false;
            return of({
              tracks: {
                items: [],
              },
            });
          }

          this.isLoadingResults = true;
          return this.searchService.list(query).pipe(
            map((response) => response ?? { tracks: { items: [] } }),
            catchError((error) => {
              this.searchError =
                error?.error?.detail ??
                error?.error?.details ??
                'Search is currently unavailable.';
              return of(undefined);
            }),
          );
        }),
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((response) => {
        this.results = response?.tracks?.items ?? [];
        this.isLoadingResults = false;
      });

    this.query$.next('');
  }

  protected get featuredTrack(): SpotifyTrack | null {
    return this.results[0] ?? null;
  }

  protected get spotlightTracks(): SpotifyTrack[] {
    return this.results.slice(1, 3);
  }

  protected get remainingTracks(): SpotifyTrack[] {
    return this.results.slice(3, 9);
  }

  protected get totalMatchesLabel(): string {
    if (!this.query.trim()) {
      return 'Search Spotify';
    }

    if (!this.results.length) {
      return '0 Matches';
    }

    return `${this.results.length} Matches`;
  }

  protected onQueryChange(value: string): void {
    this.query = value;
    this.query$.next(value.trim());
  }

  protected onAddToQueue(track: SpotifyTrack): void {
    if (!track.uri || this.addingTrackUris.has(track.uri)) {
      return;
    }

    this.queueError = '';
    this.queueFeedback = '';
    this.addingTrackUris.add(track.uri);
    this.sessionService.addSongToQueueRequest(track).subscribe({
      next: (queueResponse) => {
        this.addingTrackUris.delete(track.uri as string);
        this.addedTrackUris.add(track.uri as string);
        if (
          queueResponse.playback_status.dispatch_block_reason ===
          'no_ready_member_device'
        ) {
          this.queueFeedback =
            'Added to the room queue. It will sync once a joined Spotify member activates a controllable device.';
        } else if (queueResponse.playback_status.dispatch_block_reason) {
          this.queueFeedback =
            'Added to the room queue. It will sync once the host starts playback.';
        } else {
          this.queueFeedback = 'Added to the room queue.';
        }
      },
      error: (error) => {
        this.addingTrackUris.delete(track.uri as string);
        this.queueError =
          error?.error?.detail ??
          error?.error?.details ??
          'Could not add that track to the queue.';
      },
    });
  }

  protected onPlayNow(track: SpotifyTrack): void {
    if (!track.uri || this.playingTrackUris.has(track.uri)) {
      return;
    }

    this.queueError = '';
    this.queueFeedback = '';
    this.playingTrackUris.add(track.uri);
    this.sessionService.playTrackNowRequest(track).subscribe({
      next: () => {
        this.playingTrackUris.delete(track.uri as string);
        this.queueFeedback =
          this.sessionState.sessionType === 'everyone'
            ? 'Playback started on the joined Spotify devices that are ready.'
            : 'Playback started on the host device.';
      },
      error: (error) => {
        this.playingTrackUris.delete(track.uri as string);
        this.queueError =
          error?.error?.detail ??
          error?.error?.details ??
          'Could not start playback on the host device.';
      },
    });
  }

  protected trackArtistLine(track: SpotifyTrack): string {
    return track.artists.map((artist) => artist.name).join(' • ');
  }

  protected queueLabel(track: SpotifyTrack): string {
    if (track.uri && this.addingTrackUris.has(track.uri)) {
      return 'Adding...';
    }

    if (track.uri && this.addedTrackUris.has(track.uri)) {
      return 'Added';
    }

    return 'Add to Queue';
  }

  protected playNowLabel(track: SpotifyTrack): string {
    if (track.uri && this.playingTrackUris.has(track.uri)) {
      return 'Starting...';
    }

    return 'Play Now';
  }
}
