import { Component, Input } from '@angular/core';
import { Observable } from 'rxjs';
import { SpotifyTrack } from '../song-search/song-search.service';
import { SessionService } from '../session.service';

@Component({
  selector: 'app-song',
  templateUrl: './song.component.html',
  styleUrls: ['./song.component.scss'],
})
export class SongComponent {
  @Input() songs$?: Observable<Array<SpotifyTrack> | undefined>;
  @Input() queuingEnabled: boolean = true;
  @Input() removalEnabled: boolean = true;

  constructor(private sessionService: SessionService) {}

  protected onAddToQueue(song: SpotifyTrack) {
    if (song.uri) {
      this.sessionService.addSongToQueue(song.uri);
    }
  }

  protected onRemoveFromQueue(song: SpotifyTrack) {
    // currently not doable as there is no api endpoint at spotify.
    // queue would need to entirely be managed by the queueify application
  }
}
