import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, interval, startWith, switchMap } from 'rxjs';
import { NotificationService } from '../../../core/services/notification.service';
import { Notification } from '../../../types/notification.types';

const REFRESH_INTERVAL_MS = 10_000;

@Component({
  selector: 'app-notification-list',
  imports: [DatePipe, RouterLink],
  templateUrl: './notification-list.html',
  styleUrl: './notification-list.scss',
})
export class NotificationList implements OnInit {
  private readonly notificationService = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly notifications = signal<Notification[]>([]);

  ngOnInit(): void {
    interval(REFRESH_INTERVAL_MS)
      .pipe(
        startWith(0),
        takeUntilDestroyed(this.destroyRef),
        switchMap(() =>
          this.notificationService.getMine().pipe(
            catchError(() => {
              this.loading.set(false);
              return EMPTY;
            }),
          ),
        ),
      )
      .subscribe((notifications) => {
        this.notifications.set(notifications);
        this.loading.set(false);
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
        this.notificationService.refreshUnreadCount();
      },
    });
  }
}
