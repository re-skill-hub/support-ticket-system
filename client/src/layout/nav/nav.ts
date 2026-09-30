import { Component, OnInit, signal, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { interval, startWith } from 'rxjs';
import { NgbCollapse } from '@ng-bootstrap/ng-bootstrap';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { NotificationBell } from '../../shared/notification-bell/notification-bell';

const UNREAD_POLL_INTERVAL_MS = 30_000;

@Component({
  selector: 'app-nav',
  imports: [RouterLink, RouterLinkActive, NgbCollapse, NotificationBell],
  templateUrl: './nav.html',
  styleUrl: './nav.scss',
})
export class Nav implements OnInit {
  readonly authService = inject(AuthService);
  readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);

  readonly collapsed = signal(true);

  ngOnInit(): void {
    interval(UNREAD_POLL_INTERVAL_MS)
      .pipe(startWith(0))
      .subscribe(() => {
        if (this.authService.isAuthenticated()) {
          this.notificationService.refreshUnreadCount();
        }
      });
  }

  logout(): void {
    this.notificationService.resetUnreadCount();
    this.authService.logout().subscribe(() => this.router.navigateByUrl('/login'));
  }
}
