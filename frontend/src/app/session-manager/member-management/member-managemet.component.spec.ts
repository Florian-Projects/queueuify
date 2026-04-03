import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { SessionService } from '../session.service';

import { MemberManagemetComponent } from './member-managemet.component';

class SessionServiceStub {
  getSessionMembers() {
    return of([]);
  }
}

describe('MemberManagemetComponent', () => {
  let component: MemberManagemetComponent;
  let fixture: ComponentFixture<MemberManagemetComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [MemberManagemetComponent],
      providers: [{ provide: SessionService, useClass: SessionServiceStub }],
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(MemberManagemetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
