import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SessionManagerComponent } from './session-manager.component';

describe('SessionManagerComponent', () => {
  let component: SessionManagerComponent;
  let fixture: ComponentFixture<SessionManagerComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [SessionManagerComponent],
    });
    fixture = TestBed.createComponent(SessionManagerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
