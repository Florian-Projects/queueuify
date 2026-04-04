import { EventEmitter, NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthMode, LoginService } from '../login.service';
import { sessionState } from '../session-manager/session-manager.interfaces';
import { SessionService } from '../session-manager/session.service';
import { LandingComponent } from './landing.component';

class LoginServiceStub {
  loggedIn = false;
  loggedInChanged = new EventEmitter<boolean>();
  authModeChanged = new EventEmitter<AuthMode>();

  getAuthMode(): AuthMode {
    return null;
  }

  canHostSessions(): boolean {
    return false;
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
}

class SessionServiceStub {
  sessionChanged = new EventEmitter<sessionState>();

  getSessionState(): sessionState {
    return {
      isInSession: false,
      sessionToken: null,
      isOwner: false,
    };
  }

  resetSessionState() {}

  normalizeSessionToken(sessionToken: string): string {
    return sessionToken.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6);
  }

  createSessionRequest() {
    return of({});
  }

  joinSessionRequest() {
    return of({});
  }
}

describe('LandingComponent', () => {
  let component: LandingComponent;
  let fixture: ComponentFixture<LandingComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FormsModule],
      declarations: [LandingComponent],
      providers: [
        { provide: LoginService, useClass: LoginServiceStub },
        { provide: SessionService, useClass: SessionServiceStub },
        {
          provide: Router,
          useValue: {
            navigateByUrl: () => Promise.resolve(true),
          },
        },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });

    fixture = TestBed.createComponent(LandingComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
