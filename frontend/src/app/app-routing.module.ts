import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LandingComponent } from './landing/landing.component';
import { MemberRouteComponent } from './member-route/member-route.component';
import { OauthCallbackComponent } from './oauth-callback/oauth-callback.component';
import { QueueRouteComponent } from './queue-route/queue-route.component';
import { SearchRouteComponent } from './search-route/search-route.component';
import { SessionRouteComponent } from './session-route/session-route.component';
import { SessionShellComponent } from './session-shell/session-shell.component';

const routes: Routes = [
  { path: '', component: LandingComponent, pathMatch: 'full' },
  { path: 'oauth_callback', component: OauthCallbackComponent },
  {
    path: '',
    component: SessionShellComponent,
    children: [
      { path: 'search', component: SearchRouteComponent },
      { path: 'queue', component: QueueRouteComponent },
      { path: 'session', component: SessionRouteComponent },
      { path: 'member', component: MemberRouteComponent },
    ],
  },
  { path: '**', redirectTo: '' },
];
@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
