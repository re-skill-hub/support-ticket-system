import { Component, OnInit, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { interval, startWith } from 'rxjs';
import { NgbCollapse } from '@ng-bootstrap/ng-bootstrap';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

const UNREAD_POLL_INTERVAL_MS = 30_000;

@Component({
  selector: 'app-agent-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, NgbCollapse],
  templateUrl: './agent-shell.html',
  styleUrl: './agent-shell.scss',
})
export class AgentShell implements OnInit {
  readonly collapsed = signal(true);

  constructor(
    readonly authService: AuthService,
    readonly notificationService: NotificationService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    interval(UNREAD_POLL_INTERVAL_MS)
      .pipe(startWith(0))
      .subscribe(() => this.notificationService.refreshUnreadCount());
  }

  logout(): void {
    this.authService.logout();
    this.notificationService.resetUnreadCount();
    this.router.navigateByUrl('/login');
  }
}
