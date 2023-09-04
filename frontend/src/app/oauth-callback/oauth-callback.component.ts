import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { LoginService } from '../login.service';

@Component({
  selector: 'app-oauth-callback',
  templateUrl: './oauth-callback.component.html',
  styleUrls: ['./oauth-callback.component.scss'],
})
export class OauthCallbackComponent implements OnInit {
  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private router: Router,
    private loginService: LoginService,
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      const code = params['code'];
      const state = params['state'];
      if (state === this.loginService.getState()) {
        this.http
          .post('http://127.0.0.1:8000/exchange_oauth_code', { code, state })
          .subscribe((response: any) => {
            localStorage.setItem('session_key', response.api_token);
            this.loginService.setLoggedIn(true);
          });
      } else {
        alert('Login Failed');
      }
      this.router.navigateByUrl('/');
    });
  }
}
