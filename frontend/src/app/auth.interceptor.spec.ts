import {
  HTTP_INTERCEPTORS,
  HttpClient,
} from '@angular/common/http';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AuthInterceptor } from './auth.interceptor';

describe('AuthInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        {
          provide: HTTP_INTERCEPTORS,
          useClass: AuthInterceptor,
          multi: true,
        },
      ],
    });

    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('attaches the bearer token to authenticated API requests', () => {
    localStorage.setItem('session_key', 'session-token');

    httpClient.get('http://localhost:8000/me').subscribe();

    const request = httpMock.expectOne('http://localhost:8000/me');
    expect(request.request.headers.get('Authorization')).toBe('Bearer session-token');
    request.flush({});
  });

  it('does not attach a bearer token to public auth endpoints', () => {
    localStorage.setItem('session_key', 'session-token');

    httpClient.post('http://localhost:8000/login/anonymous', {}).subscribe();

    const request = httpMock.expectOne('http://localhost:8000/login/anonymous');
    expect(request.request.headers.has('Authorization')).toBeFalse();
    request.flush({});
  });
});
