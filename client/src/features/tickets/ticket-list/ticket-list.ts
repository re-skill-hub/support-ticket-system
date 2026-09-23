import { Component, OnInit, inject, signal, viewChild, effect } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { TicketService } from '../../../core/services/ticket.service';
import { Ticket } from '../../../types/ticket.types';
import { StatusChip } from '../../../shared/status-chip/status-chip';

@Component({
  selector: 'app-ticket-list',
  imports: [
    DatePipe,
    RouterLink,
    MatTableModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatPaginatorModule,
    MatSortModule,
    StatusChip,
  ],
  templateUrl: './ticket-list.html',
  styleUrl: './ticket-list.scss',
})
export class TicketList implements OnInit {
  private readonly ticketService = inject(TicketService);

  private readonly sort = viewChild(MatSort);
  private readonly paginator = viewChild(MatPaginator);

  readonly loading = signal(true);
  readonly hasAnyTickets = signal(false);
  readonly dataSource = new MatTableDataSource<Ticket>([]);
  readonly columns = ['title', 'status', 'createdAtUtc', 'actions'];

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
    this.ticketService.getMine().subscribe({
      next: (tickets) => {
        this.dataSource.data = tickets;
        this.hasAnyTickets.set(tickets.length > 0);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  applyFilter(value: string): void {
    this.dataSource.filter = value.trim().toLowerCase();
    this.dataSource.paginator?.firstPage();
  }
}
