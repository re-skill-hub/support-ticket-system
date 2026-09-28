import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { MetricsService } from '../../core/services/metrics.service';
import { MetricsSummary } from '../../types/metrics.types';
import { Dashboard } from './dashboard';

describe('Dashboard', () => {
  let metricsService: { getSummary: ReturnType<typeof vi.fn> };

  const initialSummary: MetricsSummary = {
    openCount: 2,
    inProgressCount: 0,
    closedCount: 0,
    avgFirstResponseMinutes: null,
    avgResolutionMinutes: null,
  };

  const updatedSummary: MetricsSummary = {
    ...initialSummary,
    openCount: 1,
    inProgressCount: 1,
    avgFirstResponseMinutes: 3.5,
  };

  beforeEach(async () => {
    metricsService = { getSummary: vi.fn().mockReturnValue(of(initialSummary)) };

    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [{ provide: MetricsService, useValue: metricsService }],
    }).compileComponents();
  });

  afterEach(() => vi.useRealTimers());

  it('refreshes metrics while the dashboard remains open', async () => {
    vi.useFakeTimers();
    metricsService.getSummary
      .mockReturnValueOnce(of(initialSummary))
      .mockReturnValueOnce(of(updatedSummary));

    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    expect(fixture.componentInstance.summary()).toEqual(initialSummary);

    await vi.advanceTimersByTimeAsync(10_000);

    expect(metricsService.getSummary).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.summary()).toEqual(updatedSummary);
    fixture.destroy();
  });
});