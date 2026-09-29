import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  CreateTicketRequest,
  Ticket,
  TicketPriority,
  TicketStatus,
  UpdateTicketStatusRequest,
} from '../../types/ticket.types';

@Injectable({ providedIn: 'root' })
export class TicketService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = `${environment.ticketApiUrl}/tickets`;

  create(request: CreateTicketRequest): Observable<Ticket> {
    return this.http.post<Ticket>(this.baseUrl, request);
  }

  getMine(): Observable<Ticket[]> {
    return this.http.get<Ticket[]>(`${this.baseUrl}/mine`);
  }

  getAll(status?: TicketStatus, priority?: TicketPriority): Observable<Ticket[]> {
    const params: Record<string, string> = {};
    if (status) {
      params['status'] = status;
    }
    if (priority) {
      params['priority'] = priority;
    }
    return this.http.get<Ticket[]>(this.baseUrl, { params });
  }

  getById(id: string): Observable<Ticket> {
    return this.http.get<Ticket>(`${this.baseUrl}/${id}`);
  }

  updateStatus(id: string, request: UpdateTicketStatusRequest): Observable<Ticket> {
    return this.http.patch<Ticket>(`${this.baseUrl}/${id}/status`, request);
  }

  assignToSelf(id: string): Observable<Ticket> {
    return this.http.patch<Ticket>(`${this.baseUrl}/${id}/assign`, {});
  }
}
