import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SesionQueueComponent } from './sesion-queue.component';

describe('SesionQueueComponent', () => {
  let component: SesionQueueComponent;
  let fixture: ComponentFixture<SesionQueueComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [SesionQueueComponent],
    });
    fixture = TestBed.createComponent(SesionQueueComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
