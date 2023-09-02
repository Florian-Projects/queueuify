import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SongSearchComponent } from './song-search.component';

describe('SongSearchComponent', () => {
  let component: SongSearchComponent;
  let fixture: ComponentFixture<SongSearchComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [SongSearchComponent],
    });
    fixture = TestBed.createComponent(SongSearchComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
