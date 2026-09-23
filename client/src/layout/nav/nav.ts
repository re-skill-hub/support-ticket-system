import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { interval, startWith } from 'rxjs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatBadgeModule } from '@angular/material/badge';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

const UNREAD_POLL_INTERVAL_MS = 30_000;

@Component({
  selector: 'app-nav',
  imports: [RouterLink, MatToolbarModule, MatButtonModule, MatIconModule, MatBadgeModule],
  templateUrl: './nav.html',
  styleUrl: './nav.scss',
})
export class Nav implements OnInit {
  constructor(
    readonly authService: AuthService,
    readonly notificationService: NotificationService,
    private readonly router: Router,
  ) {}

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
    this.authService.logout();
    this.notificationService.resetUnreadCount();
    this.router.navigateByUrl('/login');
  }
}
