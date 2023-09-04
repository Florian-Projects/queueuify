import { Component, OnInit } from '@angular/core';
import { SpotifyTrack } from '../song-search/song-search.service';
import { BehaviorSubject, map, Observable, startWith, switchMap } from 'rxjs';
import { sessionQueue, SessionService, sessionState } from '../session.service';

@Component({
  selector: 'app-sesion-queue',
  templateUrl: './sesion-queue.component.html',
  styleUrls: ['./sesion-queue.component.scss'],
})
export class SesionQueueComponent implements OnInit {
  protected sessionState: sessionState;
  constructor(private readonly sessionService: SessionService) {}
  protected refresh$ = new BehaviorSubject('');
  ngOnInit() {
    this.sessionState = this.sessionService.getSessionState();
    this.sessionService.sessionChanged.subscribe(
      (sessionState) => (this.sessionState = sessionState),
    );
  }

  protected songs$: Observable<Array<SpotifyTrack> | undefined> =
    this.refresh$.pipe(
      switchMap(() =>
        this.sessionService.getQueue().pipe(startWith(undefined)),
      ),
      map((response) => response?.queue),
    );
  protected onRefresh() {
    this.songs$.subscribe(console.log);
    this.refresh$.next('');
  }
}
