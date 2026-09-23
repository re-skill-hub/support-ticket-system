import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MetricsService } from '../../core/services/metrics.service';
import { MetricsSummary } from '../../types/metrics.types';

interface StatusSegment {
  label: string;
  count: number;
  color: string;
  pct: number;
  dasharray: string;
  dashoffset: number;
}

interface TimeBar {
  label: string;
  minutes: number | null;
  pct: number;
  color: string;
}

const DONUT_RADIUS = 15.9155;

@Component({
  selector: 'app-dashboard',
  imports: [DecimalPipe, MatCardModule, MatProgressSpinnerModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  private readonly metricsService = inject(MetricsService);

  readonly loading = signal(true);
  readonly summary = signal<MetricsSummary | null>(null);
  readonly donutRadius = DONUT_RADIUS;

  readonly totalCount = computed(() => {
    const s = this.summary();
    return s ? s.openCount + s.inProgressCount + s.closedCount : 0;
  });

  readonly statusSegments = computed<StatusSegment[]>(() => {
    const s = this.summary();
    const total = this.totalCount();
    if (!s || total === 0) {
      return [];
    }

    const entries = [
      { label: 'Open', count: s.openCount, color: '#0d47a1' },
      { label: 'In Progress', count: s.inProgressCount, color: '#8d6d00' },
      { label: 'Closed', count: s.closedCount, color: '#1b5e20' },
    ];

    let cumulativePct = 0;
    return entries.map((entry) => {
      const pct = (entry.count / total) * 100;
      const dashoffset = 25 - cumulativePct;
      cumulativePct += pct;
      return { ...entry, pct, dasharray: `${pct} ${100 - pct}`, dashoffset };
    });
  });

  readonly timeBars = computed<TimeBar[]>(() => {
    const s = this.summary();
    if (!s) {
      return [];
    }

    const max = Math.max(s.avgFirstResponseMinutes ?? 0, s.avgResolutionMinutes ?? 0, 1);
    return [
      {
        label: 'Avg first response (min)',
        minutes: s.avgFirstResponseMinutes,
        pct: s.avgFirstResponseMinutes != null ? (s.avgFirstResponseMinutes / max) * 100 : 0,
        color: '#0d47a1',
      },
      {
        label: 'Avg resolution (min)',
        minutes: s.avgResolutionMinutes,
        pct: s.avgResolutionMinutes != null ? (s.avgResolutionMinutes / max) * 100 : 0,
        color: '#1b5e20',
      },
    ];
  });

  ngOnInit(): void {
    this.metricsService.getSummary().subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
