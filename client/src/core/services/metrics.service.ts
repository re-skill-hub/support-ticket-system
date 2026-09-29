import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { MetricsSummary, TicketMetric } from '../../types/metrics.types';

@Injectable({ providedIn: 'root' })
export class MetricsService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = `${environment.notificationApiUrl}/metrics`;

  getSummary(): Observable<MetricsSummary> {
    return this.http.get<MetricsSummary>(`${this.baseUrl}/summary`);
  }

  getForTicket(ticketId: string): Observable<TicketMetric> {
    return this.http.get<TicketMetric>(`${this.baseUrl}/tickets/${ticketId}`);
  }
}
