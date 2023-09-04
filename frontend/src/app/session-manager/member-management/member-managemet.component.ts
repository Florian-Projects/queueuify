import { Component } from '@angular/core';
import { BehaviorSubject, map, Observable, startWith, switchMap } from 'rxjs';
import { SpotifyTrack } from '../song-search/song-search.service';
import { SessionService } from '../session.service';
import { user } from '../session-manager.interfaces';

@Component({
  selector: 'app-member-management',
  templateUrl: './member-management.component.html',
  styleUrls: ['./member-managemet.component.scss'],
})
export class MemberManagemetComponent {
  constructor(private sessionService: SessionService) {}
  protected refresh$ = new BehaviorSubject('');
  protected users$: Observable<Array<user> | undefined> = this.refresh$.pipe(
    switchMap(() =>
      this.sessionService.getSessionMembers().pipe(startWith(undefined)),
    ),
    map((response) => response),
  );
}
