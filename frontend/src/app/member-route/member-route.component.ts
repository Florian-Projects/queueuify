import { Component, OnInit } from '@angular/core';
import { sessionState, user } from '../session-manager/session-manager.interfaces';
import { SessionService } from '../session-manager/session.service';

@Component({
  selector: 'app-member-route',
  templateUrl: './member-route.component.html',
  styleUrls: ['./member-route.component.scss'],
})
export class MemberRouteComponent implements OnInit {
  protected sessionState: sessionState = {
    isInSession: false,
    sessionToken: null,
    isOwner: false,
  };
  protected members: user[] = [];
  protected isLoading = true;
  protected error = '';

  constructor(private readonly sessionService: SessionService) {}

  ngOnInit(): void {
    this.sessionState = this.sessionService.getSessionState();
    this.sessionService.sessionChanged.subscribe((sessionState: sessionState) => {
      this.sessionState = sessionState;

      if (sessionState.isOwner) {
        this.loadMembers();
      }
    });

    if (this.sessionState.isOwner) {
      this.loadMembers();
      return;
    }

    this.isLoading = false;
  }

  protected refreshMembers(): void {
    this.loadMembers();
  }

  private loadMembers(): void {
    this.error = '';
    this.isLoading = true;
    this.sessionService.getSessionMembers().subscribe({
      next: (members) => {
        this.members = members ?? [];
        this.isLoading = false;
      },
      error: (error) => {
        this.members = [];
        this.error =
          error?.error?.detail ??
          error?.error?.details ??
          'Member data is currently unavailable.';
        this.isLoading = false;
      },
    });
  }
}
