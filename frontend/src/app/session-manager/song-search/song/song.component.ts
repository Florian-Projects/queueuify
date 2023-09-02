import { Component, Input } from '@angular/core';
import { Observable } from 'rxjs';
import { SpotifyTrack } from '../song-search.service';
import { SessionService } from '../../session.service';

@Component({
  selector: 'app-song',
  templateUrl: './song.component.html',
  styleUrls: ['./song.component.scss'],
})
export class SongComponent {
  @Input() songs$?: Observable<Array<SpotifyTrack> | undefined>;
  constructor(private sessionService: SessionService) {}
  protected onAddToQueue(song: SpotifyTrack) {
    if (song.uri) {
      this.sessionService.addSongToQueue(song.uri);
    }
  }
}
