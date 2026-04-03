import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { sessionState } from '../session-manager/session-manager.interfaces';
import { SessionService } from '../session-manager/session.service';
import { SpotifyTrack } from '../session-manager/song-search/song-search.service';

interface SessionNavItem {
  label: string;
  icon: string;
  route: string;
  enabled: boolean;
  hostOnly?: boolean;
}

@Component({
  selector: 'app-session-shell',
  templateUrl: './session-shell.component.html',
  styleUrls: ['./session-shell.component.scss'],
})
export class SessionShellComponent implements OnInit {
  protected isLoadingSession = true;
  protected sessionState: sessionState = {
    isInSession: false,
    sessionToken: null,
    isOwner: false,
  };
  protected currentTrack: SpotifyTrack | null = null;

  private readonly navItems: SessionNavItem[] = [
    { label: 'Session', icon: 'dashboard', route: '/session', enabled: true },
    { label: 'Search', icon: 'search', route: '/search', enabled: true },
    { label: 'Queue', icon: 'queue_music', route: '/queue', enabled: true },
    {
      label: 'Member',
      icon: 'group',
      route: '/member',
      enabled: true,
      hostOnly: true,
    },
  ];

  constructor(
    private readonly router: Router,
    private readonly sessionService: SessionService,
  ) {}

  ngOnInit(): void {
    if (!localStorage.getItem('session_key')) {
      this.router.navigateByUrl('/');
      return;
    }

    this.sessionState = this.sessionService.getSessionState();
    this.isLoadingSession = !this.sessionState.isInSession;

    this.sessionService.sessionChanged.subscribe((sessionState: sessionState) => {
      this.sessionState = sessionState;
      this.isLoadingSession = false;

      if (!sessionState.isInSession) {
        this.router.navigateByUrl('/');
        return;
      }

      this.loadCurrentTrack();
    });

    if (this.sessionState.isInSession) {
      this.loadCurrentTrack();
    }
  }

  protected get visibleNavItems(): SessionNavItem[] {
    return this.navItems.filter(
      (navItem) => !navItem.hostOnly || this.sessionState.isOwner,
    );
  }

  protected get currentTrackArtistLine(): string {
    return this.currentTrack?.artists?.map((artist) => artist.name).join(' • ') ?? '';
  }

  protected onSelectNavItem(navItem: SessionNavItem): void {
    if (!navItem.enabled) {
      return;
    }

    this.router.navigateByUrl(navItem.route);
  }

  protected isActiveNavItem(navItem: SessionNavItem): boolean {
    return this.router.url === navItem.route;
  }

  private loadCurrentTrack(): void {
    this.sessionService.getQueue().subscribe({
      next: (queueResponse) => {
        this.currentTrack = queueResponse.currently_playing ?? null;
      },
      error: () => {
        this.currentTrack = null;
      },
    });
  }
}
