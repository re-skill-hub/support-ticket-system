import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TicketService } from '../../../core/services/ticket.service';
import { Ticket, TicketStatus } from '../../../types/ticket.types';
import { StatusChip } from '../../../shared/status-chip/status-chip';

@Component({
  selector: 'app-ticket-queue',
  imports: [
    DatePipe,
    RouterLink,
    MatTableModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    StatusChip,
  ],
  templateUrl: './ticket-queue.html',
  styleUrl: './ticket-queue.scss',
})
export class TicketQueue implements OnInit {
  private readonly ticketService = inject(TicketService);

  readonly loading = signal(true);
  readonly tickets = signal<Ticket[]>([]);
  readonly statusFilter = signal<TicketStatus | 'All'>('All');
  readonly columns = ['title', 'status', 'assignedAgentId', 'createdAtUtc', 'actions'];
  readonly statuses: TicketStatus[] = ['Open', 'InProgress', 'Closed'];

  ngOnInit(): void {
    this.load();
  }

  onFilterChange(value: TicketStatus | 'All'): void {
    this.statusFilter.set(value);
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    const filter = this.statusFilter();
    this.ticketService.getAll(filter === 'All' ? undefined : filter).subscribe({
      next: (tickets) => {
        this.tickets.set(tickets);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
