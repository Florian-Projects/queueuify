import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SessionService } from '../session.service';

import { SongComponent } from './song.component';

class SessionServiceStub {
  addSongToQueue() {}
}

describe('SongComponent', () => {
  let component: SongComponent;
  let fixture: ComponentFixture<SongComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [SongComponent],
      providers: [{ provide: SessionService, useClass: SessionServiceStub }],
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(SongComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
