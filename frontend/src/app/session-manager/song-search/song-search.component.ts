import { Component } from '@angular/core';
import { BehaviorSubject, map, Observable, startWith, switchMap } from 'rxjs';
import {
  SongSearchService,
  SpotifyTrack,
  SpotifyTrackList,
  SpotifyTrackResponse,
} from './song-search.service';

@Component({
  selector: 'app-song-search',
  templateUrl: './song-search.component.html',
  styleUrls: ['./song-search.component.scss'],
})
export class SongSearchComponent {
  constructor(private readonly songService: SongSearchService) {}
  protected query$ = new BehaviorSubject('');

  protected songs$: Observable<Array<SpotifyTrack> | undefined> =
    this.query$.pipe(
      switchMap((query) =>
        this.songService.list(query).pipe(startWith(undefined)),
      ),
      map((response) => response?.tracks.items),
    );
}
