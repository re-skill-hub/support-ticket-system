import { Component, DestroyRef, OnInit, signal, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { interval, startWith } from 'rxjs';
import { NgbCollapse } from '@ng-bootstrap/ng-bootstrap';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { NotificationBell } from '../../shared/notification-bell/notification-bell';

const UNREAD_POLL_INTERVAL_MS = 30_000;

@Component({
  selector: 'app-agent-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, NgbCollapse, NotificationBell],
  templateUrl: './agent-shell.html',
  styleUrl: './agent-shell.scss',
})
export class AgentShell implements OnInit {
  readonly authService = inject(AuthService);
  readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly collapsed = signal(true);

  ngOnInit(): void {
    // Guarded by isAuthenticated() and torn down via takeUntilDestroyed() so this stops polling
    // (and stops hitting /notifications/mine) the moment a staff user logs out — AgentShell is
    // unmounted right then (app.html swaps to the customer Nav branch), and an un-torn-down
    // interval would otherwise keep firing forever, 401-ing and re-triggering the "please log in"
    // toast while the user is back on the login page.
    interval(UNREAD_POLL_INTERVAL_MS)
      .pipe(startWith(0), takeUntilDestroyed(this.destroyRef))
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
