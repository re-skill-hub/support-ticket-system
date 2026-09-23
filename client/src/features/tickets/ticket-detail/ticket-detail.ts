import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormControl, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from '../../../core/services/auth.service';
import { TicketService } from '../../../core/services/ticket.service';
import { ResponseService } from '../../../core/services/response.service';
import { Ticket, TicketStatus } from '../../../types/ticket.types';
import { TicketResponseMessage } from '../../../types/response.types';
import { StatusChip } from '../../../shared/status-chip/status-chip';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';

@Component({
  selector: 'app-ticket-detail',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    StatusChip,
  ],
  templateUrl: './ticket-detail.html',
  styleUrl: './ticket-detail.scss',
})
export class TicketDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);
  readonly authService = inject(AuthService);
  private readonly ticketService = inject(TicketService);
  private readonly responseService = inject(ResponseService);

  readonly loading = signal(true);
  readonly ticket = signal<Ticket | null>(null);
  readonly responses = signal<TicketResponseMessage[]>([]);
  readonly sending = signal(false);
  readonly statuses: TicketStatus[] = ['Open', 'InProgress', 'Closed'];
  readonly statusControl = new FormControl<TicketStatus>('Open', { nonNullable: true });

  readonly replyForm = this.fb.group({
    message: this.fb.control('', [Validators.required]),
  });

  private get ticketId(): string {
    return this.route.snapshot.paramMap.get('id')!;
  }

  constructor() {
    this.statusControl.valueChanges.subscribe((status) => this.onStatusSelected(status));
  }

  ngOnInit(): void {
    this.loadTicket();
    this.loadResponses();
  }

  loadTicket(): void {
    this.ticketService.getById(this.ticketId).subscribe({
      next: (ticket) => {
        this.ticket.set(ticket);
        this.statusControl.setValue(ticket.status, { emitEvent: false });
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  loadResponses(): void {
    this.responseService.getByTicket(this.ticketId).subscribe({
      next: (responses) => this.responses.set(responses),
    });
  }

  sendReply(): void {
    if (this.replyForm.invalid || this.sending()) {
      return;
    }

    this.sending.set(true);
    const { message } = this.replyForm.getRawValue();

    this.responseService.create({ ticketId: this.ticketId, message: message! }).subscribe({
      next: () => {
        this.replyForm.reset();
        this.sending.set(false);
        this.loadResponses();
        this.loadTicket();
      },
      error: () => this.sending.set(false),
    });
  }

  assignToSelf(): void {
    this.ticketService.assignToSelf(this.ticketId).subscribe({
      next: (ticket) => this.ticket.set(ticket),
    });
  }

  private onStatusSelected(status: TicketStatus): void {
    const ticket = this.ticket();
    if (!ticket || status === ticket.status) {
      return;
    }

    if (status === 'Closed') {
      this.dialog
        .open(ConfirmDialog, {
          data: {
            title: 'Close this ticket?',
            message: 'Closing a ticket is final — there is no way to reopen it afterward.',
            confirmLabel: 'Close ticket',
          },
        })
        .afterClosed()
        .subscribe((confirmed) => {
          if (confirmed) {
            this.applyStatusChange(status);
          } else {
            this.statusControl.setValue(ticket.status, { emitEvent: false });
          }
        });
      return;
    }

    this.applyStatusChange(status);
  }

  private applyStatusChange(status: TicketStatus): void {
    this.ticketService.updateStatus(this.ticketId, { status }).subscribe({
      next: (ticket) => {
        this.ticket.set(ticket);
        this.statusControl.setValue(ticket.status, { emitEvent: false });
      },
    });
  }
}
