import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Notification } from '../../types/notification.types';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly baseUrl = `${environment.notificationApiUrl}/notifications`;

  readonly unreadCount = signal(0);

  constructor(private readonly http: HttpClient) {}

  getMine(): Observable<Notification[]> {
    return this.http.get<Notification[]>(`${this.baseUrl}/mine`);
  }

  markAsRead(id: string): Observable<void> {
    return this.http.patch<void>(`${this.baseUrl}/${id}/read`, {});
  }

  refreshUnreadCount(): void {
    this.getMine().subscribe({
      next: (notifications) => this.unreadCount.set(notifications.filter((n) => !n.readAtUtc).length),
      error: () => {},
    });
  }

  resetUnreadCount(): void {
    this.unreadCount.set(0);
  }
}
