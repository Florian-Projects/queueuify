import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
} from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private isPublicAuthRequest(url: string): boolean {
    return (
      url.endsWith('/login') ||
      url.endsWith('/login/anonymous') ||
      url.endsWith('/exchange_oauth_code')
    );
  }

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler,
  ): Observable<HttpEvent<any>> {
    if (!this.isPublicAuthRequest(req.url)) {
      const token = localStorage.getItem('session_key');
      if (token) {
        const authReq = req.clone({
          headers: req.headers.set('Authorization', 'Bearer ' + token),
        });
        return next.handle(authReq);
      }
    }

    return next.handle(req);
  }
}
