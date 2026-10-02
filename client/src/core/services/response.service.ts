import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { SILENT_INLINE_ERRORS } from '../interceptors/error.interceptor';
import { CreateResponseRequest, TicketResponseMessage } from '../../types/response.types';

@Injectable({ providedIn: 'root' })
export class ResponseService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = `${environment.responseApiUrl}/responses`;

  create(request: CreateResponseRequest): Observable<TicketResponseMessage> {
    return this.http.post<TicketResponseMessage>(this.baseUrl, request, {
      context: new HttpContext().set(SILENT_INLINE_ERRORS, true),
    });
  }

  getByTicket(ticketId: string): Observable<TicketResponseMessage[]> {
    // ticket-detail.ts's loadResponses() already retries this specific call through the known
    // "viewed right after creation" 404 race and fails quietly if retries are exhausted — don't
    // also flash a toast for an attempt that's about to be transparently retried.
    return this.http.get<TicketResponseMessage[]>(`${this.baseUrl}/ticket/${ticketId}`, {
      context: new HttpContext().set(SILENT_INLINE_ERRORS, true),
    });
  }
}
