import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { CreateTicketRequest, Ticket, TicketStatus, UpdateTicketStatusRequest } from '../../types/ticket.types';

@Injectable({ providedIn: 'root' })
export class TicketService {
  private readonly baseUrl = `${environment.ticketApiUrl}/tickets`;

  constructor(private readonly http: HttpClient) {}

  create(request: CreateTicketRequest): Observable<Ticket> {
    return this.http.post<Ticket>(this.baseUrl, request);
  }

  getMine(): Observable<Ticket[]> {
    return this.http.get<Ticket[]>(`${this.baseUrl}/mine`);
  }

  getAll(status?: TicketStatus): Observable<Ticket[]> {
    const params: Record<string, string> = status ? { status } : {};
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
