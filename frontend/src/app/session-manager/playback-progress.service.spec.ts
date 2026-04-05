import {
  discardPeriodicTasks,
  fakeAsync,
  TestBed,
  tick,
} from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { PlaybackProgressService } from './playback-progress.service';
import { sessionQueue } from './session-manager.interfaces';
import { SessionService } from './session.service';

class SessionServiceStub {
  private readonly queueStateSubject = new BehaviorSubject<sessionQueue | null>(
    null,
  );

  readonly queueState$ = this.queueStateSubject.asObservable();

  emitQueueState(queueState: sessionQueue | null): void {
    this.queueStateSubject.next(queueState);
  }
}

describe('PlaybackProgressService', () => {
  let sessionService: SessionServiceStub;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PlaybackProgressService,
        { provide: SessionService, useClass: SessionServiceStub },
      ],
    });

    sessionService = TestBed.inject(
      SessionService,
    ) as unknown as SessionServiceStub;
  });

  it('smoothly advances progress while playback is active', fakeAsync(() => {
    const service = TestBed.inject(PlaybackProgressService);
    let latestState: any;
    service.state$.subscribe((state) => {
      latestState = state;
    });

    sessionService.emitQueueState({
      currently_playing: {
        id: 'track-1',
        uri: 'spotify:track:1',
        name: 'Track One',
        duration_ms: 120000,
        artists: [{ name: 'Artist', uri: 'spotify:artist:1' }],
        album: { images: [] },
      },
      queue: [],
      now_playing: null,
      queue_items: [],
      external_items: [],
      playback_status: {
        backend: 'spotify_host',
        device_available: true,
        device_is_restricted: false,
        is_playing: true,
        progress_ms: 30000,
      },
      capabilities: {
        can_add_to_queue: true,
        can_play_now: false,
        can_remove_queued_items: false,
        can_control_playback: true,
      },
    });

    expect(latestState.elapsedLabel).toBe('00:30');
    tick(2000);

    expect(latestState.elapsedLabel).toBe('00:32');
    expect(latestState.durationLabel).toBe('02:00');
    expect(latestState.progressPercent).toBeGreaterThan(26);
    discardPeriodicTasks();
  }));

  it('does not advance progress while playback is paused', fakeAsync(() => {
    const service = TestBed.inject(PlaybackProgressService);
    let latestState: any;
    service.state$.subscribe((state) => {
      latestState = state;
    });

    sessionService.emitQueueState({
      currently_playing: {
        id: 'track-1',
        uri: 'spotify:track:1',
        name: 'Track One',
        duration_ms: 120000,
        artists: [{ name: 'Artist', uri: 'spotify:artist:1' }],
        album: { images: [] },
      },
      queue: [],
      now_playing: null,
      queue_items: [],
      external_items: [],
      playback_status: {
        backend: 'spotify_host',
        device_available: true,
        device_is_restricted: false,
        is_playing: false,
        progress_ms: 30000,
      },
      capabilities: {
        can_add_to_queue: true,
        can_play_now: false,
        can_remove_queued_items: false,
        can_control_playback: true,
      },
    });

    tick(2000);

    expect(latestState.elapsedLabel).toBe('00:30');
    discardPeriodicTasks();
  }));
});
