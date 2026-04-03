import { EventEmitter, NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SessionService } from './session.service';

import { SessionManagerComponent } from './session-manager.component';

class SessionServiceStub {
  sessionChanged = new EventEmitter();

  getSessionState() {
    return {
      isInSession: false,
      sessionToken: null,
      isOwner: false,
    };
  }
}

describe('SessionManagerComponent', () => {
  let component: SessionManagerComponent;
  let fixture: ComponentFixture<SessionManagerComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [SessionManagerComponent],
      providers: [{ provide: SessionService, useClass: SessionServiceStub }],
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(SessionManagerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
