import { TestBed } from '@angular/core/testing';

import { SongSearchService } from './song-search.service';

describe('SongSearchService', () => {
  let service: SongSearchService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SongSearchService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
