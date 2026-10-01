import { Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgbDropdown, NgbDropdownMenu, NgbDropdownToggle } from '@ng-bootstrap/ng-bootstrap';
import { NotificationService } from '../../core/services/notification.service';
import { Notification } from '../../types/notification.types';
import { RelativeTimePipe } from '../relative-time/relative-time.pipe';

const PREVIEW_SIZE = 5;

@Component({
  selector: 'app-notification-bell',
  imports: [RouterLink, RelativeTimePipe, NgbDropdown, NgbDropdownMenu, NgbDropdownToggle],
  templateUrl: './notification-bell.html',
  styleUrl: './notification-bell.scss',
})
export class NotificationBell {
  private readonly notificationService = inject(NotificationService);

  readonly toggleClass = input('nav-link position-relative');
  readonly label = input<string | null>(null);

  readonly unreadCount = this.notificationService.unreadCount;
  readonly loading = signal(false);
  readonly preview = signal<Notification[]>([]);

  onOpenChange(open: boolean): void {
    if (!open) {
      return;
    }

    this.notificationService.resetUnreadCount();
    this.loading.set(true);
    this.notificationService.getMine().subscribe({
      next: (notifications) => {
        this.preview.set(notifications.slice(0, PREVIEW_SIZE));
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
        this.preview.update((list) =>
          list.map((n) => (n.id === notification.id ? { ...n, readAtUtc: new Date().toISOString() } : n)),
        );
        this.notificationService.refreshUnreadCount();
      },
    });
  }
}
