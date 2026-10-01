import { Component, inject } from '@angular/core';
import { ConnectivityService } from '../../core/services/connectivity.service';

@Component({
  selector: 'app-offline-banner',
  templateUrl: './offline-banner.html',
})
export class OfflineBanner {
  private readonly connectivityService = inject(ConnectivityService);

  readonly isOnline = this.connectivityService.isOnline;
}
