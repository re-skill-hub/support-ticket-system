import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { retry, timer } from 'rxjs';
import { ReactiveFormsModule, FormBuilder, FormControl, Validators } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { AuthService } from '../../../core/services/auth.service';
import { TicketService } from '../../../core/services/ticket.service';
import { ResponseService } from '../../../core/services/response.service';
import { ToastService } from '../../../core/services/toast.service';
import { extractMessage } from '../../../core/interceptors/error.interceptor';
import { StaffSummary, TICKET_STATUSES, Ticket, TicketStatus } from '../../../types/ticket.types';
import { isStaffRole } from '../../../types/auth.types';
import { TicketResponseMessage } from '../../../types/response.types';
import { StatusChip } from '../../../shared/status-chip/status-chip';
import { PriorityChip } from '../../../shared/priority-chip/priority-chip';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { RelativeTimePipe } from '../../../shared/relative-time/relative-time.pipe';

@Component({
  selector: 'app-ticket-detail',
  imports: [DatePipe, RelativeTimePipe, ReactiveFormsModule, StatusChip, PriorityChip],
  templateUrl: './ticket-detail.html',
  styleUrl: './ticket-detail.scss',
})
export class TicketDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  readonly authService = inject(AuthService);
  private readonly ticketService = inject(TicketService);
  private readonly responseService = inject(ResponseService);
  private readonly toastService = inject(ToastService);

  readonly loading = signal(true);
  readonly ticket = signal<Ticket | null>(null);
  readonly responses = signal<TicketResponseMessage[]>([]);
  readonly sending = signal(false);
  readonly replyError = signal<string | null>(null);
  readonly ticketActionError = signal<string | null>(null);
  readonly agents = signal<StaffSummary[]>([]);
  readonly statuses = TICKET_STATUSES;
  readonly statusControl = new FormControl<TicketStatus>('Open', { nonNullable: true });
  // A plain [value] binding on a native <select> races the @for-generated <option>s built from
  // agents() (loaded over HTTP, so genuinely not there on first render): the browser finds no
  // matching option yet, silently falls back to the first one ("Unassigned"), and — because
  // Angular only re-applies [value] when the bound expression itself changes, not when new
  // <option> children appear — never corrects itself once agents() does load. Reactive forms'
  // SelectControlValueAccessor is built specifically to handle this (same reason statusControl
  // above is a FormControl too), so this one is too instead of a bare [value]/(change) pair.
  readonly assignControl = new FormControl<string>('', { nonNullable: true });
  readonly isStaffRole = isStaffRole;

  readonly replyForm = this.fb.group({
    message: this.fb.control('', [Validators.required, Validators.maxLength(4000)]),
  });

  private get ticketId(): string {
    return this.route.snapshot.paramMap.get('id')!;
  }

  constructor() {
    this.statusControl.valueChanges.subscribe((status) => this.onStatusSelected(status));
    this.assignControl.valueChanges.subscribe((agentId) => this.onAgentSelected(agentId));
  }

  ngOnInit(): void {
    this.loadTicket();
    this.loadResponses();
    if (this.authService.isStaff()) {
      this.ticketService.getAgents().subscribe({
        next: (agents) => this.agents.set(agents),
        // No error callback here previously meant RxJS re-threw an unhandled error on failure —
        // Angular's GlobalErrorHandler then caught it and showed its own generic toast on top of
        // whatever the real failure already surfaced. The agent dropdown just stays empty.
        error: () => undefined,
      });
    }
  }

  loadTicket(): void {
    this.ticketService.getById(this.ticketId).subscribe({
      next: (ticket) => {
        this.ticket.set(ticket);
        this.statusControl.setValue(ticket.status, { emitEvent: false });
        this.assignControl.setValue(ticket.assignedAgentId ?? '', { emitEvent: false });
        this.syncStatusControlEnabled(ticket);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  // A Closed ticket is terminal (TicketsController.UpdateStatus rejects any further transition
  // out of it) — disable the control entirely rather than let staff pick a status the API will
  // just reject.
  private syncStatusControlEnabled(ticket: Ticket): void {
    if (ticket.status === 'Closed') {
      this.statusControl.disable({ emitEvent: false });
    } else {
      this.statusControl.enable({ emitEvent: false });
    }
  }

  loadResponses(): void {
    this.responseService
      .getByTicket(this.ticketId)
      .pipe(
        // A ticket viewed right after creation can briefly 404 here: ResponseService projects
        // its own TicketRef from the TicketCreated event over RabbitMQ, which can lag a moment
        // behind the redirect into this page. Retry a few times before giving up rather than
        // showing a confusing "Unknown ticket" error for a ticket that very much exists.
        retry({
          count: 3,
          delay: (error: unknown, retryCount: number) => {
            if (error instanceof HttpErrorResponse && error.status === 404) {
              return timer(retryCount * 500);
            }
            throw error;
          },
        }),
      )
      .subscribe({
        next: (responses) => this.responses.set(responses),
        // No error callback here previously meant RxJS re-threw an unhandled error on failure —
        // Angular's GlobalErrorHandler then caught it and showed its own generic toast on top of
        // the "Unknown ticket" one from the global interceptor. If retries are exhausted, fail
        // quietly: the thread just shows empty rather than crashing the page.
        error: () => undefined,
      });
  }

  sendReply(): void {
    if (this.replyForm.invalid || this.sending()) {
      return;
    }

    this.sending.set(true);
    this.replyError.set(null);
    const { message } = this.replyForm.getRawValue();

    this.responseService.create({ ticketId: this.ticketId, message: message! }).subscribe({
      next: () => {
        this.replyForm.reset();
        this.sending.set(false);
        this.loadResponses();
        this.loadTicket();
        this.toastService.show('Reply sent.', 'success');
      },
      error: (error: HttpErrorResponse) => {
        this.sending.set(false);
        this.replyError.set(extractMessage(error));
      },
    });
  }

  authorLabel(response: TicketResponseMessage): string {
    if (response.authorUserId === this.authService.currentUser()?.id) {
      return 'You';
    }
    return isStaffRole(response.authorRole) ? 'Support' : 'Customer';
  }

  assignToSelf(): void {
    this.ticketActionError.set(null);
    this.ticketService.assignToSelf(this.ticketId).subscribe({
      next: (ticket) => {
        this.ticket.set(ticket);
        this.assignControl.setValue(ticket.assignedAgentId ?? '', { emitEvent: false });
        this.toastService.show('Ticket assigned to you.', 'success');
      },
      error: (error: HttpErrorResponse) => this.ticketActionError.set(extractMessage(error)),
    });
  }

  private onAgentSelected(agentId: string): void {
    this.ticketActionError.set(null);
    this.ticketService.assign(this.ticketId, { agentId: agentId || null }).subscribe({
      next: (ticket) => {
        this.ticket.set(ticket);
        this.assignControl.setValue(ticket.assignedAgentId ?? '', { emitEvent: false });
        this.toastService.show(agentId ? 'Ticket reassigned.' : 'Ticket unassigned.', 'success');
      },
      error: (error: HttpErrorResponse) => {
        this.ticketActionError.set(extractMessage(error));
        this.assignControl.setValue(this.ticket()?.assignedAgentId ?? '', { emitEvent: false });
      },
    });
  }

  private onStatusSelected(status: TicketStatus): void {
    const ticket = this.ticket();
    if (!ticket || status === ticket.status) {
      return;
    }

    if (status === 'Closed') {
      const modalRef = this.modal.open(ConfirmDialog);
      modalRef.componentInstance.title = 'Close this ticket?';
      modalRef.componentInstance.message = 'Closing a ticket is final — there is no way to reopen it afterward.';
      modalRef.componentInstance.confirmLabel = 'Close ticket';

      modalRef.result.then(
        (confirmed) => {
          if (confirmed) {
            this.applyStatusChange(status);
          } else {
            this.statusControl.setValue(ticket.status, { emitEvent: false });
          }
        },
        () => this.statusControl.setValue(ticket.status, { emitEvent: false }),
      );
      return;
    }

    this.applyStatusChange(status);
  }

  private applyStatusChange(status: TicketStatus): void {
    const previousStatus = this.ticket()?.status;
    this.ticketActionError.set(null);
    this.ticketService.updateStatus(this.ticketId, { status }).subscribe({
      next: (ticket) => {
        this.ticket.set(ticket);
        this.statusControl.setValue(ticket.status, { emitEvent: false });
        this.syncStatusControlEnabled(ticket);
        this.toastService.show(`Status updated to ${ticket.status}.`, 'success');
      },
      error: (error: HttpErrorResponse) => {
        this.ticketActionError.set(extractMessage(error));
        if (previousStatus) {
          this.statusControl.setValue(previousStatus, { emitEvent: false });
        }
      },
    });
  }
}
