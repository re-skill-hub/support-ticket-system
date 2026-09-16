import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { NotificationService } from '../../../core/services/notification.service';
import { Notification } from '../../../types/notification.types';

@Component({
  selector: 'app-notification-list',
  imports: [DatePipe, RouterLink, MatListModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './notification-list.html',
  styleUrl: './notification-list.scss',
})
export class NotificationList implements OnInit {
  private readonly notificationService = inject(NotificationService);

  readonly loading = signal(true);
  readonly notifications = signal<Notification[]>([]);

  ngOnInit(): void {
    this.notificationService.getMine().subscribe({
      next: (notifications) => {
        this.notifications.set(notifications);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  markAsRead(notification: Notification): void {
    if (notification.readAtUtc) {
      return;
    }

    this.notificationService.markAsRead(notification.id).subscribe({
      next: () => {
        this.notifications.update((list) =>
          list.map((n) => (n.id === notification.id ? { ...n, readAtUtc: new Date().toISOString() } : n)),
        );
      },
    });
  }
}
