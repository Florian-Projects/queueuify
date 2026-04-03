import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LandingComponent } from './landing/landing.component';
import { OauthCallbackComponent } from './oauth-callback/oauth-callback.component';
import { SearchRouteComponent } from './search-route/search-route.component';
import { SessionShellComponent } from './session-shell/session-shell.component';

const routes: Routes = [
  { path: '', component: LandingComponent, pathMatch: 'full' },
  { path: 'oauth_callback', component: OauthCallbackComponent },
  {
    path: '',
    component: SessionShellComponent,
    children: [{ path: 'search', component: SearchRouteComponent }],
  },
  { path: '**', redirectTo: '' },
];
@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
