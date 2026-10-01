import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Nav } from '../layout/nav/nav';
import { AgentShell } from '../layout/agent-shell/agent-shell';
import { ToastContainer } from '../shared/toast-container/toast-container';
import { OfflineBanner } from '../shared/offline-banner/offline-banner';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Nav, AgentShell, ToastContainer, OfflineBanner],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly authService = inject(AuthService);

  readonly isStaff = this.authService.isStaff;
}
