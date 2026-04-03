import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { SongSearchComponent } from './song-search.component';
import { SongSearchService } from './song-search.service';

class SongSearchServiceStub {
  list() {
    return of({
      tracks: {
        items: [],
      },
    });
  }
}

describe('SongSearchComponent', () => {
  let component: SongSearchComponent;
  let fixture: ComponentFixture<SongSearchComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [SongSearchComponent],
      providers: [{ provide: SongSearchService, useClass: SongSearchServiceStub }],
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(SongSearchComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
