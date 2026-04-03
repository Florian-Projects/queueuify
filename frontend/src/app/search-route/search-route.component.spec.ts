import { EventEmitter, NO_ERRORS_SCHEMA } from '@angular/core';
import { fakeAsync, ComponentFixture, TestBed, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { of } from 'rxjs';
import { SessionService } from '../session-manager/session.service';
import { SongSearchService } from '../session-manager/song-search/song-search.service';
import { SearchRouteComponent } from './search-route.component';

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
  let searchServiceSpy: jasmine.SpyObj<SongSearchService>;

  beforeEach(() => {
    searchServiceSpy = jasmine.createSpyObj<SongSearchService>('SongSearchService', [
      'list',
    ]);
    searchServiceSpy.list.and.returnValue(
      of({
        tracks: {
          items: [],
        },
      }),
    );

    TestBed.configureTestingModule({
      imports: [FormsModule],
      declarations: [SearchRouteComponent],
      providers: [
        { provide: SongSearchService, useValue: searchServiceSpy },
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

  it('does not call Spotify search on initial empty query', fakeAsync(() => {
    fixture.detectChanges();
    tick(251);

    expect(searchServiceSpy.list).not.toHaveBeenCalled();
    expect(component['isLoadingResults']).toBeFalse();
  }));

  it('searches Spotify after the user enters a non-empty query', fakeAsync(() => {
    fixture.detectChanges();

    component['onQueryChange']('Phoenix');
    tick(251);

    expect(searchServiceSpy.list).toHaveBeenCalledOnceWith('Phoenix');
  }));
});
