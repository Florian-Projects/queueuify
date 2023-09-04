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
    // Check if the request URL is not the login endpoint
    if (!req.url.endsWith('/login')) {
      // Get the token from local storage
      const token = localStorage.getItem('session_key');

      // Clone the request and set the new header
      const authReq = req.clone({
        headers: req.headers.set('Authorization', 'Bearer ' + token),
      });
      // Send the cloned request
      return next.handle(authReq);
    }
    // If it's the login endpoint just forward the request
    return next.handle(req);
  }
}
