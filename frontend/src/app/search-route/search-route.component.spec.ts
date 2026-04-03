import { EventEmitter, NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { of } from 'rxjs';
import { SessionService } from '../session-manager/session.service';
import { SongSearchService } from '../session-manager/song-search/song-search.service';
import { SearchRouteComponent } from './search-route.component';

class SongSearchServiceStub {
  list() {
    return of({
      tracks: {
        items: [],
      },
    });
  }
}

class SessionServiceStub {
  sessionChanged = new EventEmitter();

  getSessionState() {
    return {
      isInSession: true,
      sessionToken: 'ABC123',
      isOwner: true,
    };
  }

  addSongToQueueRequest() {
    return of({});
  }
}

describe('SearchRouteComponent', () => {
  let component: SearchRouteComponent;
  let fixture: ComponentFixture<SearchRouteComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FormsModule],
      declarations: [SearchRouteComponent],
      providers: [
        { provide: SongSearchService, useClass: SongSearchServiceStub },
        { provide: SessionService, useClass: SessionServiceStub },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });

    fixture = TestBed.createComponent(SearchRouteComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
