import { Component, computed, input } from '@angular/core';
import { TicketPriority } from '../../types/ticket.types';

const BADGE_CLASS: Record<TicketPriority, string> = {
  Low: 'text-bg-secondary',
  Medium: 'text-bg-info',
  High: 'text-bg-warning',
  Urgent: 'text-bg-danger',
};

@Component({
  selector: 'app-priority-chip',
  templateUrl: './priority-chip.html',
})
export class PriorityChip {
  readonly priority = input.required<TicketPriority>();

  readonly badgeClass = computed(() => BADGE_CLASS[this.priority()]);
}
