import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';

import { SessionService } from './session.service';
import { environment } from '../../environments/environments';

describe('SessionService', () => {
  let service: SessionService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(SessionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    localStorage.removeItem('session_key');
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('maps session settings into the shared session state bootstrap', () => {
    localStorage.setItem('session_key', 'token-123');

    let emittedState: any;
    service.fetchSessionStateRequest().subscribe((state) => {
      emittedState = state;
    });

    const request = httpMock.expectOne(environment.apiURL + '/session');
    expect(request.request.method).toBe('GET');
    request.flush({
      id: 1,
      token: 'ABC123',
      is_owner: true,
      expiration_time: '2026-01-01T00:00:00Z',
      session_type: 'everyone',
      playback_backend: 'spotify_host',
      disallow_anonymous_users: true,
      explicit_filter: true,
    });

    expect(emittedState).toEqual(
      jasmine.objectContaining({
        isInSession: true,
        sessionToken: 'ABC123',
        isOwner: true,
        sessionType: 'everyone',
        playbackBackend: 'spotify_host',
        disallowAnonymousUsers: true,
        explicitFilter: true,
      }),
    );
  });

  it('merges patched room settings back into session state', () => {
    localStorage.setItem('session_key', 'token-123');

    (service as any).applySessionState({
      isInSession: true,
      sessionToken: 'ABC123',
      isOwner: true,
      sessionType: 'host_only',
      playbackBackend: 'spotify_host',
      disallowAnonymousUsers: false,
      explicitFilter: false,
    });

    let responseBody: any;
    service
      .updateSessionSettingsRequest({
        session_type: 'everyone',
        disallow_anonymous_users: true,
      })
      .subscribe((response) => {
        responseBody = response;
      });

    const request = httpMock.expectOne(
      environment.apiURL + '/session/ABC123/settings',
    );
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({
      session_type: 'everyone',
      disallow_anonymous_users: true,
    });
    request.flush({
      session_type: 'everyone',
      playback_backend: 'spotify_host',
      disallow_anonymous_users: true,
      explicit_filter: false,
      everyone_playback_status: {
        ready_member_count: 1,
        unsynced_member_count: 0,
        eligible_member_count: 1,
        can_start_everyone_playback: true,
        status_message: 'Ready.',
      },
      member_sync_status: [],
    });

    expect(responseBody.session_type).toBe('everyone');
    expect((service as any).sessionState).toEqual(
      jasmine.objectContaining({
        sessionType: 'everyone',
        disallowAnonymousUsers: true,
        explicitFilter: false,
      }),
    );
  });

  it('does not emit sessionChanged for settings-only merges', () => {
    localStorage.setItem('session_key', 'token-123');
    (service as any).applySessionState({
      isInSession: true,
      sessionToken: 'ABC123',
      isOwner: true,
      sessionType: 'host_only',
      playbackBackend: 'spotify_host',
      disallowAnonymousUsers: false,
      explicitFilter: false,
    });

    const sessionChangedSpy = jasmine.createSpy('sessionChanged');
    service.sessionChanged.subscribe(sessionChangedSpy);

    service
      .updateSessionSettingsRequest({
        explicit_filter: true,
      })
      .subscribe();

    const request = httpMock.expectOne(
      environment.apiURL + '/session/ABC123/settings',
    );
    request.flush({
      session_type: 'host_only',
      playback_backend: 'spotify_host',
      disallow_anonymous_users: false,
      explicit_filter: true,
      everyone_playback_status: {
        ready_member_count: 1,
        unsynced_member_count: 0,
        eligible_member_count: 1,
        can_start_everyone_playback: true,
        status_message: 'Ready.',
      },
      member_sync_status: [],
    });

    expect(sessionChangedSpy).not.toHaveBeenCalled();
    expect((service as any).sessionState).toEqual(
      jasmine.objectContaining({
        explicitFilter: true,
      }),
    );
  });

  it('resets the shared session state when queue access shows the user is no longer in the session', () => {
    localStorage.setItem('session_key', 'token-123');
    (service as any).applySessionState({
      isInSession: true,
      sessionToken: 'ABC123',
      isOwner: false,
      sessionType: 'host_only',
      playbackBackend: 'spotify_host',
      disallowAnonymousUsers: false,
      explicitFilter: false,
    });

    const sessionChangedSpy = jasmine.createSpy('sessionChanged');
    const errorSpy = jasmine.createSpy('error');
    service.sessionChanged.subscribe(sessionChangedSpy);

    service.getQueue().subscribe({
      next: () => fail('expected queue request to fail'),
      error: errorSpy,
    });

    const request = httpMock.expectOne(environment.apiURL + '/session/ABC123/queue');
    request.flush(
      { detail: 'User is not a member of the session' },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(errorSpy).toHaveBeenCalled();
    expect(sessionChangedSpy).toHaveBeenCalledWith(
      jasmine.objectContaining({
        isInSession: false,
        sessionToken: null,
        isOwner: false,
      }),
    );
    expect((service as any).sessionState).toEqual(
      jasmine.objectContaining({
        isInSession: false,
        sessionToken: null,
        isOwner: false,
      }),
    );
  });

  it('publishes queue responses into the shared queue state stream', () => {
    localStorage.setItem('session_key', 'token-123');
    (service as any).applySessionState({
      isInSession: true,
      sessionToken: 'ABC123',
      isOwner: true,
      sessionType: 'host_only',
      playbackBackend: 'spotify_host',
      disallowAnonymousUsers: false,
      explicitFilter: false,
    });

    let latestQueueState: any = null;
    service.queueState$.subscribe((queueState) => {
      latestQueueState = queueState;
    });

    service.getQueue().subscribe();

    const request = httpMock.expectOne(environment.apiURL + '/session/ABC123/queue');
    request.flush({
      now_playing: {
        source: 'spotify_external',
        track: {
          id: 'track-1',
          uri: 'spotify:track:1',
          name: 'Track One',
          duration_ms: 180000,
          artists: [{ name: 'Artist', uri: 'spotify:artist:1' }],
          album: { images: [] },
        },
      },
      queue_items: [],
      external_items: [],
      playback_status: {
        backend: 'spotify_host',
        device_available: true,
        device_is_restricted: false,
        is_playing: true,
        progress_ms: 64000,
      },
      capabilities: {
        can_add_to_queue: true,
        can_play_now: true,
        can_remove_queued_items: true,
        can_control_playback: true,
      },
    });

    expect(latestQueueState).toEqual(
      jasmine.objectContaining({
        currently_playing: jasmine.objectContaining({
          name: 'Track One',
          duration_ms: 180000,
        }),
        playback_status: jasmine.objectContaining({
          progress_ms: 64000,
        }),
      }),
    );
  });
});
