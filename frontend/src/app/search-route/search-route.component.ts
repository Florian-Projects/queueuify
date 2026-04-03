import { Component, OnInit } from '@angular/core';
import {
  BehaviorSubject,
  catchError,
  debounceTime,
  distinctUntilChanged,
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
  protected readonly addingTrackUris = new Set<string>();
  protected readonly addedTrackUris = new Set<string>();

  private readonly query$ = new BehaviorSubject('');

  constructor(
    private readonly searchService: SongSearchService,
    private readonly sessionService: SessionService,
  ) {}

  ngOnInit(): void {
    this.sessionState = this.sessionService.getSessionState();
    this.sessionService.sessionChanged.subscribe((sessionState: sessionState) => {
      this.sessionState = sessionState;
    });

    this.query$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((query) => {
          this.isLoadingResults = true;
          this.searchError = '';
          this.addedTrackUris.clear();

          return this.searchService.list(query).pipe(
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
    this.addingTrackUris.add(track.uri);
    this.sessionService.addSongToQueueRequest(track.uri).subscribe({
      next: () => {
        this.addingTrackUris.delete(track.uri as string);
        this.addedTrackUris.add(track.uri as string);
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
}
