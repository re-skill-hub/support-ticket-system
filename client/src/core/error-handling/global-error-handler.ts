import { ErrorHandler, Injectable, inject } from '@angular/core';
import { ToastService } from '../services/toast.service';

/**
 * provideBrowserGlobalErrorListeners() (app.config.ts) covers window.onerror and unhandled
 * promise rejections, but not Angular's own internal ErrorHandler — the one invoked for errors
 * thrown during change detection, template binding, or a component's lifecycle hooks. Without
 * this override, those errors only ever reach the browser console with no user-facing fallback.
 * This still logs to console (via the default handler) and additionally shows a toast so the
 * user knows something went wrong instead of silently getting a stuck/broken screen.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly toastService = inject(ToastService);

  handleError(error: unknown): void {
    console.error(error);
    this.toastService.show('Something went wrong. Please refresh the page.', 'danger');
  }
}
