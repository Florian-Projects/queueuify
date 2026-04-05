import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { sessionState, user } from '../session-manager/session-manager.interfaces';
import { SessionService } from '../session-manager/session.service';

interface MemberViewModel extends user {
  timeout_client_remaining_seconds: number | null;
  timeout_expiry_check_pending: boolean;
}

@Component({
  selector: 'app-member-route',
  templateUrl: './member-route.component.html',
  styleUrls: ['./member-route.component.scss'],
})
export class MemberRouteComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  protected readonly timeoutOptions = [5, 15, 30, 60];

  protected sessionState: sessionState = {
    isInSession: false,
    sessionToken: null,
    isOwner: false,
  };
  protected members: MemberViewModel[] = [];
  protected isLoading = true;
  protected error = '';
  protected feedback = '';
  protected readonly busyMemberIds = new Set<number>();
  protected timeoutTargetMemberId: number | null = null;
  private isFetchingMembers = false;
  private isConfirmingExpiredTimeout = false;

  constructor(private readonly sessionService: SessionService) {}

  ngOnInit(): void {
    this.sessionState = this.sessionService.getSessionState();
    this.sessionService.sessionChanged
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((sessionState: sessionState) => {
        this.sessionState = sessionState;

        if (sessionState.isOwner) {
          this.loadMembers();
        }
      });

    interval(1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.tickMutedMembers();
      });

    interval(15000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!this.sessionState.isOwner || !this.members.length) {
          return;
        }

        this.loadMembers({ background: true, preserveFeedback: true });
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

  protected memberStatusLine(member: MemberViewModel): string {
    const parts = [];

    if (member.is_guest) {
      parts.push('Guest user');
    } else if (member.auth_mode === 'spotify') {
      parts.push('Spotify user');
    }

    if (member.is_banned) {
      parts.push('Banned from this room');
    } else if (member.is_timed_out) {
      parts.push(`Muted for ${this.remainingTimeoutLabel(member)}`);
    } else if (!member.is_active_member) {
      parts.push('Not currently in the room');
    } else {
      parts.push('Active in this room');
    }

    return parts.join(' • ');
  }

  protected remainingTimeoutLabel(member: MemberViewModel): string {
    if (
      member.timeout_expiry_check_pending &&
      (member.timeout_client_remaining_seconds ?? 0) <= 0
    ) {
      return 'syncing...';
    }

    const remaining = member.timeout_client_remaining_seconds ?? 0;
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;

    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remainder = minutes % 60;
      return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
    }

    if (minutes > 0) {
      return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
    }

    return `${seconds}s`;
  }

  protected showTimeoutOptions(member: MemberViewModel): boolean {
    return this.timeoutTargetMemberId === member.id;
  }

  protected isBusy(member: MemberViewModel): boolean {
    return this.busyMemberIds.has(member.id);
  }

  protected openTimeoutOptions(member: MemberViewModel): void {
    this.timeoutTargetMemberId =
      this.timeoutTargetMemberId === member.id ? null : member.id;
    this.feedback = '';
    this.error = '';
  }

  protected onTimeout(member: MemberViewModel, durationMinutes: number): void {
    this.runMemberAction(
      member,
      this.sessionService.timeoutSessionMember(member.id, durationMinutes),
      `Muted ${member.display_name} for ${durationMinutes} minutes.`,
    );
  }

  protected onUnmute(member: MemberViewModel): void {
    this.runMemberAction(
      member,
      this.sessionService.unmuteSessionMember(member.id),
      `${member.display_name} is no longer muted.`,
    );
  }

  protected onKick(member: MemberViewModel): void {
    this.runMemberAction(
      member,
      this.sessionService.kickSessionMember(member.id),
      `${member.display_name} was removed from the session.`,
    );
  }

  protected onBan(member: MemberViewModel): void {
    this.runMemberAction(
      member,
      this.sessionService.banSessionMember(member.id),
      `${member.display_name} was banned from this session.`,
    );
  }

  protected onUnban(member: MemberViewModel): void {
    this.runMemberAction(
      member,
      this.sessionService.unbanSessionMember(member.id),
      `${member.display_name} can join this session again.`,
    );
  }

  private loadMembers(options?: {
    background?: boolean;
    preserveFeedback?: boolean;
    onComplete?: () => void;
  }): void {
    if (this.isFetchingMembers) {
      options?.onComplete?.();
      return;
    }

    this.isFetchingMembers = true;
    this.error = '';
    if (!options?.preserveFeedback) {
      this.feedback = '';
    }
    if (!options?.background) {
      this.isLoading = true;
    }

    this.sessionService
      .getSessionMembers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (members) => {
          this.members = this.mapMembers(members ?? []);
          this.isLoading = false;
          this.isFetchingMembers = false;
          options?.onComplete?.();
        },
        error: (error) => {
          this.members = [];
          this.error =
            error?.error?.detail ??
            error?.error?.details ??
            'Member data is currently unavailable.';
          this.isLoading = false;
          this.isFetchingMembers = false;
          options?.onComplete?.();
        },
      });
  }

  private runMemberAction(
    member: MemberViewModel,
    request$: ReturnType<SessionService['getSessionMembers']>,
    successMessage: string,
  ): void {
    this.busyMemberIds.add(member.id);
    this.timeoutTargetMemberId = null;
    this.error = '';
    this.feedback = '';

    request$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (members) => {
          this.members = this.mapMembers(members ?? []);
          this.feedback = successMessage;
          this.busyMemberIds.delete(member.id);
        },
        error: (error) => {
          this.error =
            error?.error?.detail ??
            error?.error?.details ??
            'Member moderation failed.';
          this.busyMemberIds.delete(member.id);
        },
      });
  }

  private mapMembers(members: user[]): MemberViewModel[] {
    return members.map((member) => ({
      ...member,
      timeout_client_remaining_seconds: member.is_timed_out
        ? member.timeout_remaining_seconds ?? 0
        : null,
      timeout_expiry_check_pending: false,
    }));
  }

  private tickMutedMembers(): void {
    if (!this.members.length) {
      return;
    }

    let shouldConfirmExpiry = false;
    this.members = this.members.map((member) => {
      if (
        !member.is_timed_out ||
        member.timeout_client_remaining_seconds === null ||
        member.timeout_expiry_check_pending
      ) {
        return member;
      }

      const nextRemaining = Math.max(
        0,
        member.timeout_client_remaining_seconds - 1,
      );
      if (nextRemaining === 0) {
        shouldConfirmExpiry = true;
      }

      return {
        ...member,
        timeout_client_remaining_seconds: nextRemaining,
        timeout_expiry_check_pending: nextRemaining === 0,
      };
    });

    if (shouldConfirmExpiry) {
      this.confirmExpiredTimeouts();
    }
  }

  private confirmExpiredTimeouts(): void {
    if (this.isConfirmingExpiredTimeout || !this.sessionState.isOwner) {
      return;
    }

    this.isConfirmingExpiredTimeout = true;
    this.loadMembers({
      background: true,
      preserveFeedback: true,
      onComplete: () => {
        this.isConfirmingExpiredTimeout = false;
      },
    });
  }
}
