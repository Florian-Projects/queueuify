import { EventEmitter } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { SessionService } from '../session-manager/session.service';
import { SessionRouteComponent } from './session-route.component';

describe('SessionRouteComponent', () => {
  let component: SessionRouteComponent;
  let fixture: ComponentFixture<SessionRouteComponent>;
  let sessionServiceSpy: jasmine.SpyObj<SessionService>;

  const settingsResponse = {
    session_type: 'host_only' as const,
    playback_backend: 'spotify_host' as const,
    disallow_anonymous_users: false,
    explicit_filter: false,
    everyone_playback_status: {
      ready_member_count: 1,
      unsynced_member_count: 0,
      eligible_member_count: 1,
      can_start_everyone_playback: true,
      status_message: 'Everyone playback is ready on all joined Spotify members.',
    },
    member_sync_status: [
      {
        user_id: 1,
        display_name: 'Host User',
        auth_mode: 'spotify' as const,
        is_host: true,
        eligible_for_everyone_playback: true,
        device_available: true,
        device_is_restricted: false,
        is_playing: false,
        sync_state: 'ready' as const,
        status_message: 'Ready for Everyone playback.',
      },
    ],
  };

  beforeEach(() => {
    sessionServiceSpy = jasmine.createSpyObj<SessionService>(
      'SessionService',
      [
        'getSessionState',
        'getSessionSettingsRequest',
        'updateSessionSettingsRequest',
        'deleteSession',
        'leaveSession',
      ],
      { sessionChanged: new EventEmitter() },
    );
    sessionServiceSpy.getSessionState.and.returnValue({
      isInSession: true,
      sessionToken: 'ABC123',
      isOwner: true,
      sessionType: 'host_only',
      playbackBackend: 'spotify_host',
      disallowAnonymousUsers: false,
      explicitFilter: false,
    });
    sessionServiceSpy.getSessionSettingsRequest.and.returnValue(of(settingsResponse));
    sessionServiceSpy.updateSessionSettingsRequest.and.returnValue(of(settingsResponse));

    TestBed.configureTestingModule({
      declarations: [SessionRouteComponent],
      providers: [{ provide: SessionService, useValue: sessionServiceSpy }],
    });

    fixture = TestBed.createComponent(SessionRouteComponent);
    component = fixture.componentInstance;
  });

  it('loads the live room settings for the host view', () => {
    fixture.detectChanges();

    expect(sessionServiceSpy.getSessionSettingsRequest).toHaveBeenCalled();
    expect(component['settings']?.member_sync_status.length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Disallow anonymous users');
  });

  it('shows a QR join panel instead of the old access summary copy', () => {
    fixture.detectChanges();

    expect(component['sessionJoinUrl']).toContain('?join=ABC123');
    expect(fixture.nativeElement.textContent).toContain(
      'Scan to open Queueify and join this session.',
    );
    expect(fixture.nativeElement.textContent).toContain('Copy Link');
    expect(fixture.nativeElement.textContent).toContain('Share Link');
    expect(fixture.nativeElement.textContent).not.toContain(
      component['sessionJoinUrl'],
    );
    expect(fixture.nativeElement.textContent).not.toContain(
      'Guests can join this room with the current session code',
    );
    expect(fixture.nativeElement.textContent).not.toContain('Join Access');
    expect(fixture.nativeElement.textContent).not.toContain('Playback Target');
  });

  it('greys out Everyone mode until guest access is disabled and explains why', () => {
    fixture.detectChanges();

    const everyoneTooltip = fixture.nativeElement.querySelector(
      '.session-route__segment-tooltip',
    ) as HTMLElement;
    const everyoneButton = fixture.nativeElement.querySelectorAll(
      '.session-route__segment-button',
    )[1] as HTMLButtonElement;

    expect(everyoneButton.disabled).toBeTrue();
    expect(everyoneButton.classList).toContain('session-route__segment-button--blocked');
    expect(everyoneTooltip.getAttribute('title')).toContain(
      'Enable Disallow anonymous users',
    );
  });

  it('blocks Everyone mode in the UI until anonymous access is disabled', () => {
    fixture.detectChanges();

    component['onSetSessionType']('everyone');

    expect(sessionServiceSpy.updateSessionSettingsRequest).not.toHaveBeenCalled();
    expect(component['settingsError']).toContain('Enable Disallow anonymous users');
  });

  it('saves the explicit filter toggle and shows backend feedback', () => {
    fixture.detectChanges();

    component['onToggleExplicitFilter'](true);

    expect(sessionServiceSpy.updateSessionSettingsRequest).toHaveBeenCalledWith({
      explicit_filter: true,
    });
    expect(component['settingsFeedback']).toContain('Explicit tracks are now blocked');
  });

  it('does not reload the full settings view after a successful toggle', () => {
    fixture.detectChanges();
    expect(sessionServiceSpy.getSessionSettingsRequest).toHaveBeenCalledTimes(1);

    component['onToggleExplicitFilter'](true);

    expect(sessionServiceSpy.getSessionSettingsRequest).toHaveBeenCalledTimes(1);
    expect(component['isLoadingSettings']).toBeFalse();
  });

  it('surfaces backend validation errors from settings updates', () => {
    sessionServiceSpy.updateSessionSettingsRequest.and.returnValue(
      throwError(() => ({
        error: { detail: 'Everyone mode requires Disallow anonymous users.' },
      })),
    );
    fixture.detectChanges();
    component['settings'] = {
      ...settingsResponse,
      disallow_anonymous_users: true,
    };

    component['onSetSessionType']('everyone');

    expect(component['settingsError']).toContain(
      'Everyone mode requires Disallow anonymous users.',
    );
  });
});
