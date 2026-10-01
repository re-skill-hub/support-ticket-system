import { Component } from '@angular/core';

@Component({
  selector: 'app-service-unavailable',
  templateUrl: './service-unavailable.html',
  styleUrl: './service-unavailable.scss',
})
export class ServiceUnavailable {
  reload(): void {
    window.location.reload();
  }
}
