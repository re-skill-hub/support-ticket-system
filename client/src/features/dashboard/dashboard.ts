import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MetricsService } from '../../core/services/metrics.service';
import { MetricsSummary } from '../../types/metrics.types';

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
