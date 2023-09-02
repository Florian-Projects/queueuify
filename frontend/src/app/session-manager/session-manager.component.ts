import { Component, OnInit } from '@angular/core';
import { SessionService, sessionState } from './session.service';

@Component({
  selector: 'app-session-manager',
  templateUrl: './session-manager.component.html',
  styleUrls: ['./session-manager.component.scss'],
})
export class SessionManagerComponent implements OnInit {
  protected sessionState: sessionState;
  constructor(private sessionService: SessionService) {}
  ngOnInit() {
    this.sessionState = this.sessionService.getSessionState();
    this.sessionService.sessionChanged.subscribe(
      (sessionState) => (this.sessionState = sessionState),
    );
  }
}
