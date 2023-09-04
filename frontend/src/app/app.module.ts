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
import { SongSearchComponent } from './session-manager/song-search/song-search.component';
import { SesionQueueComponent } from './session-manager/sesion-queue/sesion-queue.component';
import { FormsModule } from '@angular/forms';
import { SongComponent } from './session-manager/song/song.component';
import { MatCardModule } from '@angular/material/card';
import { UserComponent } from './session-manager/member-management/user/user.component';
import { MemberManagemetComponent } from './session-manager/member-management/member-managemet.component';

@NgModule({
  declarations: [
    AppComponent,
    MenubarComponent,
    OauthCallbackComponent,
    SessionManagerComponent,
    JoinSessionDialogComponent,
    SongSearchComponent,
    SesionQueueComponent,
    SongComponent,
    UserComponent,
    MemberManagemetComponent,
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
    FormsModule,
    MatCardModule,
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
