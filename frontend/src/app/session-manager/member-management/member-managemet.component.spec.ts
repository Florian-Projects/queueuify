import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MemberManagemetComponent } from './member-managemet.component';

describe('MemberManagemetComponent', () => {
  let component: MemberManagemetComponent;
  let fixture: ComponentFixture<MemberManagemetComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [MemberManagemetComponent],
    });
    fixture = TestBed.createComponent(MemberManagemetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
