import { Component, OnInit, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { interval, startWith } from 'rxjs';
import { NgbCollapse } from '@ng-bootstrap/ng-bootstrap';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

const UNREAD_POLL_INTERVAL_MS = 30_000;

@Component({
  selector: 'app-nav',
  imports: [RouterLink, RouterLinkActive, NgbCollapse],
  templateUrl: './nav.html',
  styleUrl: './nav.scss',
})
export class Nav implements OnInit {
  readonly collapsed = signal(true);

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
    this.notificationService.resetUnreadCount();
    this.authService.logout().subscribe(() => this.router.navigateByUrl('/login'));
  }
}
