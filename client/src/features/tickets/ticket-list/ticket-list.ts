import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TicketService } from '../../../core/services/ticket.service';
import { Ticket } from '../../../types/ticket.types';
import { StatusChip } from '../../../shared/status-chip/status-chip';

@Component({
  selector: 'app-ticket-list',
  imports: [DatePipe, RouterLink, MatTableModule, MatButtonModule, MatProgressSpinnerModule, StatusChip],
  templateUrl: './ticket-list.html',
  styleUrl: './ticket-list.scss',
})
export class TicketList implements OnInit {
  private readonly ticketService = inject(TicketService);

  readonly loading = signal(true);
  readonly tickets = signal<Ticket[]>([]);
  readonly columns = ['title', 'status', 'createdAtUtc', 'actions'];

  ngOnInit(): void {
    this.ticketService.getMine().subscribe({
      next: (tickets) => {
        this.tickets.set(tickets);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
