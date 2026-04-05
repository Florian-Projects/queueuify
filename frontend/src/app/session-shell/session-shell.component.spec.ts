import { EventEmitter, NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { SessionService } from '../session-manager/session.service';
import { SessionShellComponent } from './session-shell.component';

class SessionServiceStub {
  sessionChanged = new EventEmitter();
  private readonly queueStateSubject = new BehaviorSubject<any>(null);
  readonly queueState$ = this.queueStateSubject.asObservable();
  isOwner = true;
  currentTrack: any = null;
  isPlaying = true;
  canControlPlayback = true;

  getSessionState() {
    return {
      isInSession: true,
      sessionToken: 'ABC123',
      isOwner: this.isOwner,
    };
  }

  getQueue() {
    const queueResponse = {
      currently_playing: this.currentTrack,
      queue: [],
      now_playing: this.currentTrack ? { track: this.currentTrack } : null,
      queue_items: [],
      external_items: [],
      playback_status: {
        backend: 'spotify_host',
        device_available: this.canControlPlayback,
        device_is_restricted: false,
        is_playing: this.isPlaying,
        progress_ms: 30000,
      },
      capabilities: {
        can_add_to_queue: true,
        can_play_now: false,
        can_remove_queued_items: false,
        can_control_playback: this.canControlPlayback,
      },
    };
    this.queueStateSubject.next(queueResponse);
    return of(queueResponse);
  }

  fetchSessionState() {}

  getCurrentQueueState() {
    return this.queueStateSubject.value;
  }

  pausePlaybackRequest() {
    this.isPlaying = false;
    return this.getQueue();
  }

  resumePlaybackRequest() {
    this.isPlaying = true;
    return this.getQueue();
  }

  skipToNextRequest() {
    return this.getQueue();
  }

  skipToPreviousRequest() {
    return this.getQueue();
  }
}

describe('SessionShellComponent', () => {
  let component: SessionShellComponent;
  let fixture: ComponentFixture<SessionShellComponent>;
  let sessionService: SessionServiceStub;
  let routerStub: { navigateByUrl: jasmine.Spy; url: string };

  beforeEach(() => {
    localStorage.setItem('session_key', 'token-123');
    routerStub = {
      navigateByUrl: jasmine
        .createSpy('navigateByUrl')
        .and.resolveTo(true),
      url: '/search',
    };

    TestBed.configureTestingModule({
      declarations: [SessionShellComponent],
      providers: [
        { provide: SessionService, useClass: SessionServiceStub },
        { provide: Router, useValue: routerStub },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });

    fixture = TestBed.createComponent(SessionShellComponent);
    component = fixture.componentInstance;
    sessionService = TestBed.inject(
      SessionService,
    ) as unknown as SessionServiceStub;
  });

  afterEach(() => {
    localStorage.removeItem('session_key');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders only implemented navigation items', () => {
    fixture.detectChanges();

    const navItems = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.session-shell__nav-item',
      ) as NodeListOf<Element>,
    );
    const navLabels = navItems.map((element: Element) => element.textContent?.trim());

    expect(navItems.length).toBe(4);
    expect(navLabels[0]).toContain('Session');
    expect(navLabels[1]).toContain('Search');
    expect(navLabels[2]).toContain('Queue');
    expect(navLabels[3]).toContain('Member');
  });

  it('shows transport controls only for the host', () => {
    sessionService.currentTrack = {
      name: 'Track Name',
      uri: 'spotify:track:123',
      artists: [{ name: 'Artist', uri: 'spotify:artist:1' }],
      album: { images: [{ url: 'https://example.com/art.jpg' }] },
    };
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('.session-shell__now-playing-controls'),
    ).not.toBeNull();

    sessionService.isOwner = false;
    sessionService.sessionChanged.emit({
      isInSession: true,
      sessionToken: 'ABC123',
      isOwner: false,
    });
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('.session-shell__now-playing-controls'),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('.session-shell__now-playing'),
    ).not.toBeNull();
  });

  it('wires the playback controls for the host', () => {
    sessionService.currentTrack = {
      name: 'Track Name',
      uri: 'spotify:track:123',
      duration_ms: 120000,
      artists: [{ name: 'Artist', uri: 'spotify:artist:1' }],
      album: { images: [{ url: 'https://example.com/art.jpg' }] },
    };
    const pauseSpy = spyOn(sessionService, 'pausePlaybackRequest').and.callThrough();
    const nextSpy = spyOn(sessionService, 'skipToNextRequest').and.callThrough();
    const previousSpy = spyOn(sessionService, 'skipToPreviousRequest').and.callThrough();

    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll(
      '.session-shell__now-playing-controls button',
    ) as NodeListOf<HTMLButtonElement>;
    buttons[0].click();
    buttons[1].click();
    buttons[2].click();

    expect(previousSpy).toHaveBeenCalled();
    expect(pauseSpy).toHaveBeenCalled();
    expect(nextSpy).toHaveBeenCalled();
  });

  it('renders the live playback timing labels', () => {
    sessionService.currentTrack = {
      name: 'Track Name',
      uri: 'spotify:track:123',
      duration_ms: 120000,
      artists: [{ name: 'Artist', uri: 'spotify:artist:1' }],
      album: { images: [{ url: 'https://example.com/art.jpg' }] },
    };

    fixture.detectChanges();

    const times = fixture.nativeElement.querySelector(
      '.session-shell__now-playing-times',
    ) as HTMLElement;

    expect(times.textContent).toContain('00:30');
    expect(times.textContent).toContain('02:00');
  });

  it('navigates back to landing when the session is lost', () => {
    fixture.detectChanges();

    sessionService.sessionChanged.emit({
      isInSession: false,
      sessionToken: null,
      isOwner: false,
    });

    expect(routerStub.navigateByUrl).toHaveBeenCalledWith('/');
  });
});
