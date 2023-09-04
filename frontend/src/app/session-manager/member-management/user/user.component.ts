import { Component, Input } from '@angular/core';
import { Observable } from 'rxjs';
import { SpotifyTrack } from '../../song-search/song-search.service';

import { user } from '../../session-manager.interfaces';

@Component({
  selector: 'app-user',
  templateUrl: './user.component.html',
  styleUrls: ['./user.component.scss'],
})
export class UserComponent {
  @Input() users$?: Observable<Array<user> | undefined>;
}
