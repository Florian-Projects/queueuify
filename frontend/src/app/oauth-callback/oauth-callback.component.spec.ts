import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, of } from 'rxjs';
import { LoginService } from '../login.service';
import { SessionService } from '../session-manager/session.service';
import { OauthCallbackComponent } from './oauth-callback.component';
import { environment } from '../../environments/environments';

describe('OauthCallbackComponent', () => {
  let component: OauthCallbackComponent;
  let fixture: ComponentFixture<OauthCallbackComponent>;
  let httpMock: HttpTestingController;
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
      'storeSessionToken',
    ]);
    sessionServiceSpy = jasmine.createSpyObj<SessionService>('SessionService', [
      'fetchSessionStateRequest',
    ]);
    loginServiceSpy.getState.and.returnValue('expected');
    sessionServiceSpy.fetchSessionStateRequest.and.returnValue(
      of({
        isInSession: false,
        sessionToken: null,
        isOwner: false,
      }),
    );

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

    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(OauthCallbackComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    httpMock.verify();
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

    const request = httpMock.expectOne(environment.apiURL + '/exchange_oauth_code');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      code: 'spotify-code',
      state: 'expected',
    });
    request.flush({ api_token: 'token-123' });

    expect(loginServiceSpy.storeSessionToken).toHaveBeenCalledOnceWith(
      'token-123',
      'spotify',
    );
    expect(sessionServiceSpy.fetchSessionStateRequest).toHaveBeenCalledTimes(1);
    expect(navigateSpy).toHaveBeenCalledOnceWith('/search');
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
    expect(loginServiceSpy.storeSessionToken).not.toHaveBeenCalled();
    expect(sessionServiceSpy.fetchSessionStateRequest).not.toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledOnceWith('/');
  });
});
