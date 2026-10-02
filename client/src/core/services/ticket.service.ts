import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { SILENT_INLINE_ERRORS } from '../interceptors/error.interceptor';
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
    return this.http.post<Ticket>(this.baseUrl, request, {
      context: new HttpContext().set(SILENT_INLINE_ERRORS, true),
    });
  }

  getMine(): Observable<Ticket[]> {
    // RequestState (see ticket-list.ts) surfaces a load failure inline with a Retry button —
    // suppress the redundant global toast for the same failure.
    return this.http.get<Ticket[]>(`${this.baseUrl}/mine`, {
      context: new HttpContext().set(SILENT_INLINE_ERRORS, true),
    });
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
    return this.http.get<Ticket[]>(this.baseUrl, {
      params,
      context: new HttpContext().set(SILENT_INLINE_ERRORS, true),
    });
  }

  getById(id: string): Observable<Ticket> {
    return this.http.get<Ticket>(`${this.baseUrl}/${id}`);
  }

  updateStatus(id: string, request: UpdateTicketStatusRequest): Observable<Ticket> {
    return this.http.patch<Ticket>(`${this.baseUrl}/${id}/status`, request, {
      context: new HttpContext().set(SILENT_INLINE_ERRORS, true),
    });
  }

  assignToSelf(id: string): Observable<Ticket> {
    // Must send no body at all, not `{}`: TicketsController.Assign tells "assign to me" apart
    // from "explicit unassign" only via `request is null` vs. an `AssignTicketRequest` whose
    // AgentId happens to be null — and `{}` deserializes to the latter (a non-null request with
    // AgentId defaulting to null), which the controller treats as unassign.
    return this.http.patch<Ticket>(`${this.baseUrl}/${id}/assign`, null, {
      context: new HttpContext().set(SILENT_INLINE_ERRORS, true),
    });
  }

  assign(id: string, request: AssignTicketRequest): Observable<Ticket> {
    return this.http.patch<Ticket>(`${this.baseUrl}/${id}/assign`, request, {
      context: new HttpContext().set(SILENT_INLINE_ERRORS, true),
    });
  }

  getAgents(): Observable<StaffSummary[]> {
    return this.http.get<StaffSummary[]>(`${this.baseUrl}/agents`);
  }
}
