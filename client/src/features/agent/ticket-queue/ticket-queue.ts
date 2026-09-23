import { Component, OnInit, inject, signal, viewChild, effect } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
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
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatPaginatorModule,
    MatSortModule,
    StatusChip,
  ],
  templateUrl: './ticket-queue.html',
  styleUrl: './ticket-queue.scss',
})
export class TicketQueue implements OnInit {
  private readonly ticketService = inject(TicketService);

  private readonly sort = viewChild(MatSort);
  private readonly paginator = viewChild(MatPaginator);

  readonly loading = signal(true);
  readonly hasAnyTickets = signal(false);
  readonly dataSource = new MatTableDataSource<Ticket>([]);
  readonly statusFilter = signal<TicketStatus | 'All'>('All');
  readonly columns = ['title', 'status', 'assignedAgentId', 'createdAtUtc', 'actions'];
  readonly statuses: TicketStatus[] = ['Open', 'InProgress', 'Closed'];

  constructor() {
    this.dataSource.filterPredicate = (ticket, filter) => ticket.title.toLowerCase().includes(filter);

    effect(() => {
      const sort = this.sort();
      if (sort) {
        this.dataSource.sort = sort;
      }
    });

    effect(() => {
      const paginator = this.paginator();
      if (paginator) {
        this.dataSource.paginator = paginator;
      }
    });
  }

  ngOnInit(): void {
    this.load();
  }

  onFilterChange(value: TicketStatus | 'All'): void {
    this.statusFilter.set(value);
    this.load();
  }

  applySearch(value: string): void {
    this.dataSource.filter = value.trim().toLowerCase();
    this.dataSource.paginator?.firstPage();
  }

  private load(): void {
    this.loading.set(true);
    const filter = this.statusFilter();
    this.ticketService.getAll(filter === 'All' ? undefined : filter).subscribe({
      next: (tickets) => {
        this.dataSource.data = tickets;
        this.hasAnyTickets.set(tickets.length > 0);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
