import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MenubarComponent } from './menubar/menubar.component';
import { HttpClientModule } from '@angular/common/http';
import { OauthCallbackComponent } from './oauth-callback/oauth-callback.component';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SessionManagerComponent } from './session-manager/session-manager.component';
import { JoinSessionDialogComponent } from './join-session-dialog/join-session-dialog.component';
import { MatInputModule } from '@angular/material/input';
import { MatDialogModule } from '@angular/material/dialog';

@NgModule({
  declarations: [
    AppComponent,
    MenubarComponent,
    OauthCallbackComponent,
    SessionManagerComponent,
    JoinSessionDialogComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    HttpClientModule,
    BrowserAnimationsModule,
    MatTabsModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatInputModule,
    MatDialogModule,
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
