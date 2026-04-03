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

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [SessionShellComponent],
      providers: [
        { provide: SessionService, useClass: SessionServiceStub },
        {
          provide: Router,
          useValue: {
            navigateByUrl: () => Promise.resolve(true),
          },
        },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });

    fixture = TestBed.createComponent(SessionShellComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
