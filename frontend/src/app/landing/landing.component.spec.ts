import { EventEmitter, NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { AuthMode, LoginService } from '../login.service';
import { sessionState } from '../session-manager/session-manager.interfaces';
import { SessionService } from '../session-manager/session.service';
import { LandingComponent } from './landing.component';

class LoginServiceStub {
  loggedIn = false;
  canHost = false;
  loggedInChanged = new EventEmitter<boolean>();
  authModeChanged = new EventEmitter<AuthMode>();
  pendingJoinCode: string | null = null;

  getAuthMode(): AuthMode {
    return null;
  }

  canHostSessions(): boolean {
    return this.canHost;
  }

  bootstrapCurrentUser() {
    return of(null);
  }

  login() {
    return of({ authorization_url: 'https://example.com' });
  }

  loginAnonymous() {
    return of({
      api_token: 'token',
      auth_mode: 'anonymous',
      can_host_sessions: false,
      display_name: 'Guest TEST',
    });
  }

  logout() {
    return of({});
  }

  clearClientSession() {}

  setPendingJoinCode(sessionCode: string | null) {
    this.pendingJoinCode = sessionCode;
  }

  getPendingJoinCode(): string | null {
    return this.pendingJoinCode;
  }

  clearPendingJoinCode() {
    this.pendingJoinCode = null;
  }
}

class SessionServiceStub {
  sessionChanged = new EventEmitter<sessionState>();
  state: sessionState = {
    isInSession: false,
    sessionToken: null,
    isOwner: false,
  };

  getSessionState(): sessionState {
    return this.state;
  }

  resetSessionState() {}

  fetchSessionStateRequest() {
    return of(this.state);
  }

  normalizeSessionToken(sessionToken: string): string {
    return sessionToken.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6);
  }

  createSessionRequest() {
    return of({});
  }

  joinSessionRequest(_sessionToken?: string) {
    return of({});
  }
}

describe('LandingComponent', () => {
  let component: LandingComponent;
  let fixture: ComponentFixture<LandingComponent>;
  let sessionService: SessionServiceStub;
  let loginService: LoginServiceStub;
  let routerStub: { navigateByUrl: jasmine.Spy };
  let queryParamMap$: BehaviorSubject<any>;

  beforeEach(() => {
    queryParamMap$ = new BehaviorSubject(convertToParamMap({}));
    routerStub = {
      navigateByUrl: jasmine.createSpy('navigateByUrl').and.resolveTo(true),
    };

    TestBed.configureTestingModule({
      imports: [FormsModule],
      declarations: [LandingComponent],
      providers: [
        { provide: LoginService, useClass: LoginServiceStub },
        { provide: SessionService, useClass: SessionServiceStub },
        {
          provide: Router,
          useValue: routerStub,
        },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: queryParamMap$.asObservable(),
          },
        },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });

    fixture = TestBed.createComponent(LandingComponent);
    component = fixture.componentInstance;
    sessionService = TestBed.inject(SessionService) as unknown as SessionServiceStub;
    loginService = TestBed.inject(LoginService) as unknown as LoginServiceStub;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('does not keep redirecting after the landing component is destroyed', () => {
    fixture.detectChanges();
    routerStub.navigateByUrl.calls.reset();

    fixture.destroy();
    sessionService.sessionChanged.emit({
      isInSession: true,
      sessionToken: 'ABC123',
      isOwner: false,
    });

    expect(routerStub.navigateByUrl).not.toHaveBeenCalled();
  });

  it('routes hosts to the session view after creating a session', () => {
    loginService.loggedIn = true;
    loginService.canHost = true;
    fixture.detectChanges();
    routerStub.navigateByUrl.calls.reset();

    component['onCreateSession']();
    sessionService.sessionChanged.emit({
      isInSession: true,
      sessionToken: 'ABC123',
      isOwner: true,
    });

    expect(routerStub.navigateByUrl).toHaveBeenCalledWith('/session');
  });

  it('routes joined users to search after joining a session', () => {
    loginService.loggedIn = true;
    fixture.detectChanges();
    routerStub.navigateByUrl.calls.reset();

    component['sessionCode'] = 'abc123';
    component['onJoinSession']();
    sessionService.sessionChanged.emit({
      isInSession: true,
      sessionToken: 'ABC123',
      isOwner: false,
    });

    expect(routerStub.navigateByUrl).toHaveBeenCalledWith('/search');
  });

  it('auto-joins a linked session for a logged-in user', () => {
    loginService.loggedIn = true;
    queryParamMap$.next(convertToParamMap({ join: 'ab12cd' }));
    const joinSpy = spyOn(sessionService, 'joinSessionRequest').and.returnValue(of({}));

    fixture.detectChanges();

    expect(joinSpy).toHaveBeenCalledOnceWith('AB12CD');
    expect(component['sessionCode']).toBe('AB12CD');
  });

  it('joins the linked session immediately after anonymous login', () => {
    queryParamMap$.next(convertToParamMap({ join: 'ab12cd' }));
    const joinSpy = spyOn(sessionService, 'joinSessionRequest').and.returnValue(of({}));

    fixture.detectChanges();
    component['onSecondaryAction']();

    expect(joinSpy).toHaveBeenCalledOnceWith('AB12CD');
  });
});
