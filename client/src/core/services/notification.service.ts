import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Notification } from '../../types/notification.types';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly baseUrl = `${environment.notificationApiUrl}/notifications`;

  constructor(private readonly http: HttpClient) {}

  getMine(): Observable<Notification[]> {
    return this.http.get<Notification[]>(`${this.baseUrl}/mine`);
  }

  markAsRead(id: string): Observable<void> {
    return this.http.patch<void>(`${this.baseUrl}/${id}/read`, {});
  }
}
