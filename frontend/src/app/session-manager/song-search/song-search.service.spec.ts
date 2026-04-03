import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';

import { SongSearchService } from './song-search.service';

describe('SongSearchService', () => {
  let service: SongSearchService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(SongSearchService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
