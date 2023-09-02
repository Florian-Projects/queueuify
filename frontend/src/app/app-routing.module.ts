import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { OauthCallbackComponent } from './oauth-callback/oauth-callback.component';

const routes: Routes = [
  { path: 'oauth_callback', component: OauthCallbackComponent },
];
@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
