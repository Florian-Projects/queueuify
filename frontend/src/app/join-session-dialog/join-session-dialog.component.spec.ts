import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JoinSessionDialogComponent } from './join-session-dialog.component';

describe('JoinSessionDialogComponent', () => {
  let component: JoinSessionDialogComponent;
  let fixture: ComponentFixture<JoinSessionDialogComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [JoinSessionDialogComponent],
    });
    fixture = TestBed.createComponent(JoinSessionDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
