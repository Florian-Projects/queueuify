import { EventEmitter, NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { SessionService } from '../session-manager/session.service';
import { SessionShellComponent } from './session-shell.component';

class SessionServiceStub {
  sessionChanged = new EventEmitter();

  getSessionState() {
    return {
      isInSession: true,
      sessionToken: 'ABC123',
      isOwner: true,
    };
  }

  getQueue() {
    return {
      subscribe: ({ next }: { next: (response: any) => void }) =>
        next({ currently_playing: null, queue: [] }),
    };
  }
}

describe('SessionShellComponent', () => {
  let component: SessionShellComponent;
  let fixture: ComponentFixture<SessionShellComponent>;
  let routerStub: { navigateByUrl: jasmine.Spy; url: string };

  beforeEach(() => {
    localStorage.setItem('session_key', 'token-123');
    routerStub = {
      navigateByUrl: jasmine
        .createSpy('navigateByUrl')
        .and.resolveTo(true),
      url: '/search',
    };

    TestBed.configureTestingModule({
      declarations: [SessionShellComponent],
      providers: [
        { provide: SessionService, useClass: SessionServiceStub },
        { provide: Router, useValue: routerStub },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });

    fixture = TestBed.createComponent(SessionShellComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    localStorage.removeItem('session_key');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders only implemented navigation items', () => {
    fixture.detectChanges();

    const navItems = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.session-shell__nav-item',
      ) as NodeListOf<Element>,
    );
    const navLabels = navItems.map((element: Element) => element.textContent?.trim());

    expect(navItems.length).toBe(4);
    expect(navLabels[0]).toContain('Session');
    expect(navLabels[1]).toContain('Search');
    expect(navLabels[2]).toContain('Queue');
    expect(navLabels[3]).toContain('Member');
  });
});
