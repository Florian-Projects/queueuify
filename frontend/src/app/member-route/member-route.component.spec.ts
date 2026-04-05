import { EventEmitter, NO_ERRORS_SCHEMA } from '@angular/core';
import { fakeAsync, ComponentFixture, TestBed, tick } from '@angular/core/testing';
import { of } from 'rxjs';
import { SessionService } from '../session-manager/session.service';
import { MemberRouteComponent } from './member-route.component';

describe('MemberRouteComponent', () => {
  let component: MemberRouteComponent;
  let fixture: ComponentFixture<MemberRouteComponent>;
  let sessionServiceSpy: jasmine.SpyObj<SessionService>;

  const rosterResponse = [
    {
      id: 2,
      display_name: 'Guest User',
      auth_mode: 'anonymous' as const,
      is_guest: true,
      is_active_member: true,
      is_banned: false,
      is_timed_out: false,
      can_kick: true,
      can_ban: false,
      can_timeout: true,
      can_unban: false,
      can_unmute: false,
    },
    {
      id: 3,
      display_name: 'Banned User',
      auth_mode: 'spotify' as const,
      is_guest: false,
      is_active_member: false,
      is_banned: true,
      is_timed_out: false,
      can_kick: false,
      can_ban: false,
      can_timeout: false,
      can_unban: true,
      can_unmute: false,
    },
  ];

  beforeEach(() => {
    sessionServiceSpy = jasmine.createSpyObj<SessionService>(
      'SessionService',
      ['getSessionState', 'getSessionMembers'],
      { sessionChanged: new EventEmitter() },
    );
    sessionServiceSpy.getSessionState.and.returnValue({
      isInSession: true,
      sessionToken: 'ABC123',
      isOwner: true,
    });
    sessionServiceSpy.getSessionMembers.and.returnValue(of(rosterResponse));

    TestBed.configureTestingModule({
      declarations: [MemberRouteComponent],
      providers: [{ provide: SessionService, useValue: sessionServiceSpy }],
      schemas: [NO_ERRORS_SCHEMA],
    });

    fixture = TestBed.createComponent(MemberRouteComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('hides the ban action for guest users', () => {
    fixture.detectChanges();

    const guestRow = Array.from(
      fixture.nativeElement.querySelectorAll('.member-route__row'),
    )[0] as HTMLElement;
    expect(guestRow.textContent).toContain('Guest User');
    expect(guestRow.textContent).not.toContain('Ban');
    expect(guestRow.textContent).toContain('Timeout');
    expect(guestRow.textContent).toContain('Kick');
  });

  it('shows unban for banned members', () => {
    fixture.detectChanges();

    const bannedRow = Array.from(
      fixture.nativeElement.querySelectorAll('.member-route__row'),
    )[1] as HTMLElement;
    expect(bannedRow.textContent).toContain('Banned User');
    expect(bannedRow.textContent).toContain('Unban');
  });

  it('ticks muted countdowns locally while the view stays open', fakeAsync(() => {
    sessionServiceSpy.getSessionMembers.and.returnValue(
      of([
        {
          id: 4,
          display_name: 'Muted User',
          auth_mode: 'spotify',
          is_guest: false,
          is_active_member: true,
          is_banned: false,
          is_timed_out: true,
          timeout_remaining_seconds: 10,
          can_kick: true,
          can_ban: true,
          can_timeout: false,
          can_unban: false,
          can_unmute: true,
        },
      ]),
    );

    fixture.detectChanges();
    tick(1000);

    const member = component['members'][0];
    expect(member.timeout_client_remaining_seconds).toBe(9);
    fixture.destroy();
  }));

  it('refreshes members every 15 seconds and confirms expired timeouts', fakeAsync(() => {
    sessionServiceSpy.getSessionMembers.and.returnValues(
      of([
        {
          id: 5,
          display_name: 'Sync User',
          auth_mode: 'spotify',
          is_guest: false,
          is_active_member: true,
          is_banned: false,
          is_timed_out: true,
          timeout_remaining_seconds: 1,
          can_kick: true,
          can_ban: true,
          can_timeout: false,
          can_unban: false,
          can_unmute: true,
        },
      ]),
      of([
        {
          id: 5,
          display_name: 'Sync User',
          auth_mode: 'spotify',
          is_guest: false,
          is_active_member: true,
          is_banned: false,
          is_timed_out: false,
          can_kick: true,
          can_ban: true,
          can_timeout: true,
          can_unban: false,
          can_unmute: false,
        },
      ]),
      of(rosterResponse),
    );

    fixture.detectChanges();
    expect(sessionServiceSpy.getSessionMembers).toHaveBeenCalledTimes(1);

    tick(1000);
    expect(sessionServiceSpy.getSessionMembers).toHaveBeenCalledTimes(2);
    expect(component['members'][0].is_timed_out).toBeFalse();

    tick(14000);
    expect(sessionServiceSpy.getSessionMembers).toHaveBeenCalledTimes(3);
    fixture.destroy();
  }));
});
