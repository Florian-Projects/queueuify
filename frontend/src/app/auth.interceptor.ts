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
  intercept(
    req: HttpRequest<any>,
    next: HttpHandler,
  ): Observable<HttpEvent<any>> {
    if (!req.url.endsWith('/login')) {
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
