import { Component, computed, input } from '@angular/core';
import { TicketStatus } from '../../types/ticket.types';

const BADGE_CLASS: Record<TicketStatus, string> = {
  Open: 'text-bg-primary',
  InProgress: 'text-bg-warning',
  Closed: 'text-bg-success',
};

@Component({
  selector: 'app-status-chip',
  templateUrl: './status-chip.html',
})
export class StatusChip {
  readonly status = input.required<TicketStatus>();

  readonly badgeClass = computed(() => BADGE_CLASS[this.status()]);

  readonly label = computed(() => {
    switch (this.status()) {
      case 'InProgress':
        return 'In Progress';
      default:
        return this.status();
    }
  });
}
