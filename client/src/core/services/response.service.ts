import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { CreateResponseRequest, TicketResponseMessage } from '../../types/response.types';

@Injectable({ providedIn: 'root' })
export class ResponseService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = `${environment.responseApiUrl}/responses`;

  create(request: CreateResponseRequest): Observable<TicketResponseMessage> {
    return this.http.post<TicketResponseMessage>(this.baseUrl, request);
  }

  getByTicket(ticketId: string): Observable<TicketResponseMessage[]> {
    return this.http.get<TicketResponseMessage[]>(`${this.baseUrl}/ticket/${ticketId}`);
  }
}
