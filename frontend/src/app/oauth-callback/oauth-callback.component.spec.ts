import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, of } from 'rxjs';
import { LoginService } from '../login.service';
import { SessionService } from '../session-manager/session.service';
import { OauthCallbackComponent } from './oauth-callback.component';

describe('OauthCallbackComponent', () => {
  let component: OauthCallbackComponent;
  let fixture: ComponentFixture<OauthCallbackComponent>;
  let router: Router;
  let queryParams$: BehaviorSubject<Record<string, string>>;
  let loginServiceSpy: jasmine.SpyObj<LoginService>;
  let sessionServiceSpy: jasmine.SpyObj<SessionService>;

  beforeEach(() => {
    queryParams$ = new BehaviorSubject<Record<string, string>>({
      code: 'spotify-code',
      state: 'expected',
    });
    loginServiceSpy = jasmine.createSpyObj<LoginService>('LoginService', [
      'getState',
      'completeSpotifyLogin',
      'getPendingJoinCode',
      'clearPendingJoinCode',
    ]);
    sessionServiceSpy = jasmine.createSpyObj<SessionService>('SessionService', [
      'fetchSessionStateRequest',
      'joinSessionRequest',
      'normalizeSessionToken',
    ]);
    loginServiceSpy.getState.and.returnValue('expected');
    loginServiceSpy.getPendingJoinCode.and.returnValue(null);
    loginServiceSpy.completeSpotifyLogin.and.returnValue(
      of({
        api_token: 'token-123',
        auth_mode: 'spotify',
        can_host_sessions: true,
        display_name: 'Spotify User',
      }),
    );
    sessionServiceSpy.normalizeSessionToken.and.callFake(
      (sessionToken: string) => sessionToken.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6),
    );
    sessionServiceSpy.fetchSessionStateRequest.and.returnValue(
      of({
        isInSession: false,
        sessionToken: null,
        isOwner: false,
      }),
    );
    sessionServiceSpy.joinSessionRequest.and.returnValue(of({}));

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule],
      declarations: [OauthCallbackComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            queryParams: queryParams$.asObservable(),
          },
        },
        { provide: LoginService, useValue: loginServiceSpy },
        { provide: SessionService, useValue: sessionServiceSpy },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(OauthCallbackComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('routes to search when the Spotify user already has an active session', () => {
    const navigateSpy = spyOn(router, 'navigateByUrl').and.resolveTo(true);
    sessionServiceSpy.fetchSessionStateRequest.and.returnValue(
      of({
        isInSession: true,
        sessionToken: 'ABC123',
        isOwner: true,
      }),
    );

    fixture.detectChanges();

    expect(loginServiceSpy.completeSpotifyLogin).toHaveBeenCalledOnceWith(
      'spotify-code',
      'expected',
    );
    expect(sessionServiceSpy.fetchSessionStateRequest).toHaveBeenCalledTimes(1);
    expect(navigateSpy).toHaveBeenCalledOnceWith('/search');
  });

  it('joins the linked session after Spotify login when a pending join code exists', () => {
    const navigateSpy = spyOn(router, 'navigateByUrl').and.resolveTo(true);
    loginServiceSpy.getPendingJoinCode.and.returnValue('ab12cd');

    fixture.detectChanges();

    expect(sessionServiceSpy.joinSessionRequest).toHaveBeenCalledOnceWith('AB12CD');
    expect(loginServiceSpy.clearPendingJoinCode).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith('/search');
  });

  it('routes back to landing when the OAuth state is invalid', () => {
    const navigateSpy = spyOn(router, 'navigateByUrl').and.resolveTo(true);
    const alertSpy = spyOn(window, 'alert');

    queryParams$.next({
      code: 'spotify-code',
      state: 'invalid',
    });

    fixture.detectChanges();

    expect(alertSpy).toHaveBeenCalledOnceWith('Login Failed');
    expect(loginServiceSpy.completeSpotifyLogin).not.toHaveBeenCalled();
    expect(sessionServiceSpy.fetchSessionStateRequest).not.toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledOnceWith('/');
  });
});
