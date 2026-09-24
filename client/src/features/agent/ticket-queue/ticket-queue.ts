import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NgbPagination } from '@ng-bootstrap/ng-bootstrap';
import { TicketService } from '../../../core/services/ticket.service';
import { Ticket, TicketPriority, TicketStatus } from '../../../types/ticket.types';
import { StatusChip } from '../../../shared/status-chip/status-chip';
import { PriorityChip } from '../../../shared/priority-chip/priority-chip';
import { SortableHeader, SortDirection, SortEvent } from '../../../shared/sortable-header/sortable-header.directive';

const PAGE_SIZE = 10;

@Component({
  selector: 'app-ticket-queue',
  imports: [DatePipe, RouterLink, NgbPagination, StatusChip, PriorityChip, SortableHeader],
  templateUrl: './ticket-queue.html',
  styleUrl: './ticket-queue.scss',
})
export class TicketQueue implements OnInit {
  private readonly ticketService = inject(TicketService);

  readonly loading = signal(true);
  readonly tickets = signal<Ticket[]>([]);
  readonly searchTerm = signal('');
  readonly statusFilter = signal<TicketStatus | 'All'>('All');
  readonly priorityFilter = signal<TicketPriority | 'All'>('All');
  readonly sortColumn = signal('createdAtUtc');
  readonly sortDirection = signal<SortDirection>('desc');
  readonly page = signal(1);
  readonly pageSize = PAGE_SIZE;

  readonly statuses: TicketStatus[] = ['Open', 'InProgress', 'Closed'];
  readonly priorities: TicketPriority[] = ['Low', 'Medium', 'High', 'Urgent'];

  readonly hasAnyTickets = computed(() => this.tickets().length > 0);

  readonly filtered = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const rows = term ? this.tickets().filter((t) => t.title.toLowerCase().includes(term)) : this.tickets();
    return this.sortRows(rows);
  });

  readonly total = computed(() => this.filtered().length);

  readonly pagedTickets = computed(() => {
    const start = (this.page() - 1) * this.pageSize;
    return this.filtered().slice(start, start + this.pageSize);
  });

  ngOnInit(): void {
    this.load();
  }

  onStatusFilterChange(value: TicketStatus | 'All'): void {
    this.statusFilter.set(value);
    this.load();
  }

  onPriorityFilterChange(value: TicketPriority | 'All'): void {
    this.priorityFilter.set(value);
    this.load();
  }

  applySearch(value: string): void {
    this.searchTerm.set(value);
    this.page.set(1);
  }

  onSort({ column, direction }: SortEvent): void {
    this.sortColumn.set(column);
    this.sortDirection.set(direction);
  }

  private load(): void {
    this.loading.set(true);
    this.page.set(1);
    const statusFilter = this.statusFilter();
    const priorityFilter = this.priorityFilter();
    this.ticketService
      .getAll(statusFilter === 'All' ? undefined : statusFilter, priorityFilter === 'All' ? undefined : priorityFilter)
      .subscribe({
        next: (tickets) => {
          this.tickets.set(tickets);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  private sortRows(rows: Ticket[]): Ticket[] {
    const column = this.sortColumn();
    const direction = this.sortDirection();
    if (!direction) {
      return rows;
    }

    const sorted = [...rows].sort((a, b) => {
      const valueA = String(a[column as keyof Ticket] ?? '');
      const valueB = String(b[column as keyof Ticket] ?? '');
      return valueA.localeCompare(valueB);
    });

    return direction === 'asc' ? sorted : sorted.reverse();
  }
}
