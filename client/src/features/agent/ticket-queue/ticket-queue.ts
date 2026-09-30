import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NgbPagination } from '@ng-bootstrap/ng-bootstrap';
import { TicketService } from '../../../core/services/ticket.service';
import { Ticket, TicketCategory, TicketPriority, TicketStatus } from '../../../types/ticket.types';
import { StatusChip } from '../../../shared/status-chip/status-chip';
import { PriorityChip } from '../../../shared/priority-chip/priority-chip';
import { SortableHeader, SortDirection, SortEvent } from '../../../shared/sortable-header/sortable-header.directive';
import { RelativeTimePipe } from '../../../shared/relative-time/relative-time.pipe';

const PAGE_SIZE = 10;
const AGING_THRESHOLD_HOURS = 24;

@Component({
  selector: 'app-ticket-queue',
  imports: [DatePipe, RelativeTimePipe, RouterLink, NgbPagination, StatusChip, PriorityChip, SortableHeader],
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
  readonly categoryFilter = signal<TicketCategory | 'All'>('All');
  readonly customerIdFilter = signal('');
  readonly fromDateFilter = signal('');
  readonly toDateFilter = signal('');
  readonly sortColumn = signal('createdAtUtc');
  readonly sortDirection = signal<SortDirection>('desc');
  readonly page = signal(1);
  readonly pageSize = PAGE_SIZE;

  readonly statuses: TicketStatus[] = ['Open', 'InProgress', 'Closed'];
  readonly priorities: TicketPriority[] = ['Low', 'Medium', 'High', 'Urgent'];
  readonly categories: TicketCategory[] = ['General', 'Technical', 'Billing', 'Account'];

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

  onCategoryFilterChange(value: TicketCategory | 'All'): void {
    this.categoryFilter.set(value);
    this.load();
  }

  onCustomerIdFilterChange(value: string): void {
    this.customerIdFilter.set(value);
    this.load();
  }

  onFromDateFilterChange(value: string): void {
    this.fromDateFilter.set(value);
    this.load();
  }

  onToDateFilterChange(value: string): void {
    this.toDateFilter.set(value);
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
    const categoryFilter = this.categoryFilter();
    const customerId = this.customerIdFilter().trim();
    const fromDate = this.fromDateFilter();
    const toDate = this.toDateFilter();

    this.ticketService
      .getAll({
        status: statusFilter === 'All' ? undefined : statusFilter,
        priority: priorityFilter === 'All' ? undefined : priorityFilter,
        category: categoryFilter === 'All' ? undefined : categoryFilter,
        customerId: customerId || undefined,
        fromUtc: fromDate ? `${fromDate}T00:00:00.000Z` : undefined,
        toUtc: toDate ? `${toDate}T23:59:59.999Z` : undefined,
      })
      .subscribe({
        next: (tickets) => {
          this.tickets.set(tickets);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  isAging(ticket: Ticket): boolean {
    if (ticket.assignedAgentId || ticket.status === 'Closed') {
      return false;
    }
    const ageHours = (Date.now() - new Date(ticket.createdAtUtc).getTime()) / (1000 * 60 * 60);
    return ageHours >= AGING_THRESHOLD_HOURS;
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
