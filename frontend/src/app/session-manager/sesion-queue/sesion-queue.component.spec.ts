import { EventEmitter, NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SessionService } from '../session.service';

import { SesionQueueComponent } from './sesion-queue.component';

class SessionServiceStub {
  sessionChanged = new EventEmitter();

  getSessionState() {
    return {
      isInSession: false,
      sessionToken: null,
      isOwner: false,
    };
  }

  getQueue() {
    return {
      subscribe: () => undefined,
    };
  }
}

describe('SesionQueueComponent', () => {
  let component: SesionQueueComponent;
  let fixture: ComponentFixture<SesionQueueComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [SesionQueueComponent],
      providers: [{ provide: SessionService, useClass: SessionServiceStub }],
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(SesionQueueComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
