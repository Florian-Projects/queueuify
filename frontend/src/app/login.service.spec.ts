import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { LoginService } from './login.service';

describe('LoginService', () => {
  let service: LoginService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(LoginService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('starts an explicit anonymous session via the dedicated backend endpoint', () => {
    service.loginAnonymous().subscribe((response) => {
      expect(response.auth_mode).toBe('anonymous');
      expect(service.loggedIn).toBeTrue();
      expect(service.getAuthMode()).toBe('anonymous');
      expect(localStorage.getItem('session_key')).toBe('anon-token');
    });

    const request = httpMock.expectOne('http://localhost:8000/login/anonymous');
    expect(request.request.method).toBe('POST');
    request.flush({
      api_token: 'anon-token',
      auth_mode: 'anonymous',
      can_host_sessions: false,
      display_name: 'Guest TEST',
    });
  });

  it('bootstraps the logged-in user from the backend instead of frontend heuristics', () => {
    localStorage.setItem('session_key', 'existing-token');
    service = TestBed.inject(LoginService);

    service.bootstrapCurrentUser().subscribe((response) => {
      expect(response?.auth_mode).toBe('spotify');
      expect(service.loggedIn).toBeTrue();
      expect(service.getAuthMode()).toBe('spotify');
    });

    const request = httpMock.expectOne('http://localhost:8000/me');
    expect(request.request.method).toBe('GET');
    request.flush({
      auth_mode: 'spotify',
      can_host_sessions: true,
      display_name: 'Spotify User',
    });
  });

  it('clears stale client auth when bootstrapping returns unauthorized', () => {
    localStorage.setItem('session_key', 'stale-token');
    service = TestBed.inject(LoginService);

    service.bootstrapCurrentUser().subscribe({
      next: () => fail('Expected bootstrapCurrentUser to fail'),
      error: (error) => {
        expect(error.status).toBe(401);
        expect(service.loggedIn).toBeFalse();
        expect(service.getAuthMode()).toBeNull();
        expect(localStorage.getItem('session_key')).toBeNull();
      },
    });

    const request = httpMock.expectOne('http://localhost:8000/me');
    request.flush({ detail: 'Invalid token' }, { status: 401, statusText: 'Unauthorized' });
  });
});
