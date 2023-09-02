import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import {
  SessionService,
  sessionState,
} from '../session-manager/session.service';
import { MatDialog } from '@angular/material/dialog';
import { JoinSessionDialogComponent } from '../join-session-dialog/join-session-dialog.component';

@Component({
  selector: 'app-menubar',
  templateUrl: './menubar.component.html',
  styleUrls: ['./menubar.component.scss'],
})
export class MenubarComponent implements OnInit {
  @Input() loggedIn: boolean = false;
  @Output() login = new EventEmitter<{ type: string }>();
  protected sessionState: sessionState;

  constructor(
    private sessionService: SessionService,
    private dialog: MatDialog,
  ) {}
  ngOnInit() {
    this.sessionState = this.sessionService.getSessionState();
    this.sessionService.sessionChanged.subscribe(
      (sessionState) => (this.sessionState = sessionState),
    );
  }

  protected onLogin(type: string): void {
    this.login.emit({ type });
  }

  protected onCreateSession(): void {
    this.sessionService.createSession();
  }
  protected onDeleteSession(): void {
    this.sessionService.deleteSession();
  }
  protected onJoinSession(): void {
    this.dialog
      .open(JoinSessionDialogComponent)
      .afterClosed()
      .subscribe((sessionToken) =>
        this.sessionService.joinSession(sessionToken),
      );
  }
  protected onLeaveSession(): void {
    if (this.sessionState.sessionToken) {
      this.sessionService.leaveSession(this.sessionState.sessionToken);
    }
  }
}
