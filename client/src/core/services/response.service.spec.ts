import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { TicketResponseMessage } from '../../types/response.types';
import { ResponseService } from './response.service';

describe('ResponseService', () => {
  let service: ResponseService;
  let httpMock: HttpTestingController;
  const baseUrl = `${environment.responseApiUrl}/responses`;

  const message: TicketResponseMessage = {
    id: 'r1',
    ticketId: 't1',
    authorUserId: 'u1',
    authorRole: 'SupportAgent',
    message: 'Looking into this now.',
    createdAtUtc: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ResponseService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('create() posts to /responses', () => {
    service.create({ ticketId: 't1', message: message.message }).subscribe((res) => expect(res).toEqual(message));

    const req = httpMock.expectOne(baseUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ ticketId: 't1', message: message.message });
    req.flush(message);
  });

  it('getByTicket() gets /responses/ticket/:id', () => {
    service.getByTicket('t1').subscribe((res) => expect(res).toEqual([message]));

    const req = httpMock.expectOne(`${baseUrl}/ticket/t1`);
    expect(req.request.method).toBe('GET');
    req.flush([message]);
  });
});
