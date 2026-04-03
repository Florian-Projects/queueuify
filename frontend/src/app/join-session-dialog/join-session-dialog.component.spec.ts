import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';

import { JoinSessionDialogComponent } from './join-session-dialog.component';

describe('JoinSessionDialogComponent', () => {
  let component: JoinSessionDialogComponent;
  let fixture: ComponentFixture<JoinSessionDialogComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [JoinSessionDialogComponent],
      providers: [
        {
          provide: MatDialogRef,
          useValue: {
            close: () => undefined,
          },
        },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(JoinSessionDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
