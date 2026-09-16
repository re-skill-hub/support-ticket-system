import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { MetricsSummary, TicketMetric } from '../../types/metrics.types';

@Injectable({ providedIn: 'root' })
export class MetricsService {
  private readonly baseUrl = `${environment.notificationApiUrl}/metrics`;

  constructor(private readonly http: HttpClient) {}

  getSummary(): Observable<MetricsSummary> {
    return this.http.get<MetricsSummary>(`${this.baseUrl}/summary`);
  }

  getForTicket(ticketId: string): Observable<TicketMetric> {
    return this.http.get<TicketMetric>(`${this.baseUrl}/tickets/${ticketId}`);
  }
}
