import { Component, computed, input } from '@angular/core';
import { NgClass } from '@angular/common';
import { MatChipsModule } from '@angular/material/chips';
import { TicketStatus } from '../../types/ticket.types';

@Component({
  selector: 'app-status-chip',
  imports: [NgClass, MatChipsModule],
  templateUrl: './status-chip.html',
  styleUrl: './status-chip.scss',
})
export class StatusChip {
  readonly status = input.required<TicketStatus>();

  readonly cssClass = computed(() => `status-${this.status().toLowerCase()}`);

  readonly label = computed(() => {
    switch (this.status()) {
      case 'InProgress':
        return 'In Progress';
      default:
        return this.status();
    }
  });
}
