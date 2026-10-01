import { Injectable, OnDestroy, signal } from '@angular/core';

/**
 * Tracks browser online/offline state as a signal so components/guards can react to sustained
 * network-down conditions (e.g. redirecting to the service-unavailable page) instead of treating
 * every transient 5xx the same way a full network outage is treated.
 */
@Injectable({ providedIn: 'root' })
export class ConnectivityService implements OnDestroy {
  readonly isOnline = signal(navigator.onLine);

  private readonly onlineHandler = () => this.isOnline.set(true);
  private readonly offlineHandler = () => this.isOnline.set(false);

  constructor() {
    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
  }

  ngOnDestroy(): void {
    window.removeEventListener('online', this.onlineHandler);
    window.removeEventListener('offline', this.offlineHandler);
  }
}
