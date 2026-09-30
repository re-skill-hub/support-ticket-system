import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AssignTicketRequest,
  CreateTicketRequest,
  StaffSummary,
  Ticket,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  UpdateTicketStatusRequest,
} from '../../types/ticket.types';

export interface TicketQueryFilters {
  status?: TicketStatus;
  priority?: TicketPriority;
  category?: TicketCategory;
  customerId?: string;
  fromUtc?: string;
  toUtc?: string;
}

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

  getAll(filters: TicketQueryFilters = {}): Observable<Ticket[]> {
    const params: Record<string, string> = {};
    if (filters.status) {
      params['status'] = filters.status;
    }
    if (filters.priority) {
      params['priority'] = filters.priority;
    }
    if (filters.category) {
      params['category'] = filters.category;
    }
    if (filters.customerId) {
      params['customerId'] = filters.customerId;
    }
    if (filters.fromUtc) {
      params['fromUtc'] = filters.fromUtc;
    }
    if (filters.toUtc) {
      params['toUtc'] = filters.toUtc;
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

  assign(id: string, request: AssignTicketRequest): Observable<Ticket> {
    return this.http.patch<Ticket>(`${this.baseUrl}/${id}/assign`, request);
  }

  getAgents(): Observable<StaffSummary[]> {
    return this.http.get<StaffSummary[]>(`${this.baseUrl}/agents`);
  }
}
