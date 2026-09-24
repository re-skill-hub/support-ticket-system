import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { MetricsSummary, TicketMetric } from '../../types/metrics.types';
import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;
  let httpMock: HttpTestingController;
  const baseUrl = `${environment.notificationApiUrl}/metrics`;

  const summary: MetricsSummary = {
    openCount: 3,
    inProgressCount: 2,
    closedCount: 5,
    avgFirstResponseMinutes: 12.5,
    avgResolutionMinutes: 90,
  };

  const metric: TicketMetric = {
    ticketId: 't1',
    status: 'Closed',
    createdAtUtc: '2026-01-01T00:00:00Z',
    firstResponseAtUtc: '2026-01-01T00:10:00Z',
    closedAtUtc: '2026-01-01T01:00:00Z',
    firstResponseMinutes: 10,
    resolutionMinutes: 60,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MetricsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getSummary() gets /metrics/summary', () => {
    service.getSummary().subscribe((res) => expect(res).toEqual(summary));

    const req = httpMock.expectOne(`${baseUrl}/summary`);
    expect(req.request.method).toBe('GET');
    req.flush(summary);
  });

  it('getForTicket() gets /metrics/tickets/:id', () => {
    service.getForTicket('t1').subscribe((res) => expect(res).toEqual(metric));

    const req = httpMock.expectOne(`${baseUrl}/tickets/t1`);
    expect(req.request.method).toBe('GET');
    req.flush(metric);
  });
});
