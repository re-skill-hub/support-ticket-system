import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { defer, delay, of, throwError } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { ResponseService } from '../../../core/services/response.service';
import { TicketService } from '../../../core/services/ticket.service';
import { ToastService } from '../../../core/services/toast.service';
import { StaffSummary, Ticket } from '../../../types/ticket.types';
import { TicketResponseMessage } from '../../../types/response.types';
import { TicketDetail } from './ticket-detail';

describe('TicketDetail', () => {
  let ticketService: {
    getById: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
    assignToSelf: ReturnType<typeof vi.fn>;
    assign: ReturnType<typeof vi.fn>;
    getAgents: ReturnType<typeof vi.fn>;
  };
  let responseService: { getByTicket: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  let toastService: { show: ReturnType<typeof vi.fn> };

  const ticket: Ticket = {
    id: 't1',
    title: 'Cannot log in',
    description: 'Password reset link is broken',
    status: 'Open',
    priority: 'High',
    category: 'Technical',
    customerId: 'u1',
    assignedAgentId: null,
    assignedAgentName: null,
    createdAtUtc: '2026-01-01T00:00:00Z',
    updatedAtUtc: '2026-01-01T00:00:00Z',
    closedAtUtc: null,
  };

  const response: TicketResponseMessage = {
    id: 'r1',
    ticketId: 't1',
    authorUserId: 'agent1',
    authorRole: 'SupportAgent',
    message: 'Looking into this now.',
    createdAtUtc: '2026-01-01T01:00:00Z',
  };

  const agents: StaffSummary[] = [
    { id: 'agent1', fullName: 'Ada Agent' },
    { id: 'agent2', fullName: 'Bob Agent' },
  ];

  beforeEach(async () => {
    ticketService = {
      getById: vi.fn().mockReturnValue(of(ticket)),
      updateStatus: vi.fn().mockReturnValue(of({ ...ticket, status: 'InProgress' })),
      assignToSelf: vi.fn().mockReturnValue(of({ ...ticket, assignedAgentId: 'agent1' })),
      assign: vi.fn().mockReturnValue(of({ ...ticket, assignedAgentId: 'agent2' })),
      getAgents: vi.fn().mockReturnValue(of(agents)),
    };
    responseService = {
      getByTicket: vi.fn().mockReturnValue(of([response])),
      create: vi.fn().mockReturnValue(of(response)),
    };
    toastService = { show: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [TicketDetail],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TicketService, useValue: ticketService },
        { provide: ResponseService, useValue: responseService },
        { provide: ToastService, useValue: toastService },
        {
          provide: AuthService,
          useValue: { isAgent: () => false, isStaff: () => false, isCustomer: () => true, currentUser: () => null },
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 't1' } } },
        },
      ],
    }).compileComponents();
  });

  function createComponent() {
    const fixture = TestBed.createComponent(TicketDetail);
    fixture.detectChanges();
    return fixture;
  }

  function createStaffComponent() {
    TestBed.overrideProvider(AuthService, {
      useValue: { isAgent: () => true, isStaff: () => true, isCustomer: () => false, currentUser: () => null },
    });
    return createComponent();
  }

  it('loads the ticket and its responses on init', () => {
    const fixture = createComponent();
    const component = fixture.componentInstance;

    expect(ticketService.getById).toHaveBeenCalledWith('t1');
    expect(responseService.getByTicket).toHaveBeenCalledWith('t1');
    expect(component.ticket()).toEqual(ticket);
    expect(component.responses()).toEqual([response]);
    expect(component.loading()).toBe(false);
  });

  afterEach(() => vi.useRealTimers());

  it('retries loading responses through the "viewed right after creation" 404 race and recovers', async () => {
    vi.useFakeTimers();
    // defer() re-runs this factory on every subscription — retry() resubscribes to the same
    // Observable it got back from getByTicket() rather than calling it again, same as a real
    // HttpClient call re-issuing the request on each attempt (see timeout.interceptor.spec.ts).
    let attempts = 0;
    responseService.getByTicket.mockReturnValue(
      defer(() => {
        attempts++;
        return attempts === 1 ? throwError(() => new HttpErrorResponse({ status: 404 })) : of([response]);
      }),
    );
    const fixture = createComponent();

    await vi.advanceTimersByTimeAsync(1000);

    expect(attempts).toBe(2);
    expect(fixture.componentInstance.responses()).toEqual([response]);
  });

  it('does not retry loading responses on a non-404 error, and fails quietly rather than crashing', async () => {
    vi.useFakeTimers();
    responseService.getByTicket.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    const fixture = createComponent();

    await vi.advanceTimersByTimeAsync(2000);

    expect(responseService.getByTicket).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.responses()).toEqual([]);
  });

  it('does not crash the page when loading staff agents fails', () => {
    ticketService.getAgents.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));

    const fixture = createStaffComponent();

    expect(fixture.componentInstance.agents()).toEqual([]);
  });

  it('sends a reply and reloads the thread and ticket', () => {
    const fixture = createComponent();
    const component = fixture.componentInstance;

    component.replyForm.setValue({ message: 'Thanks for the update' });
    component.sendReply();

    expect(responseService.create).toHaveBeenCalledWith({ ticketId: 't1', message: 'Thanks for the update' });
    expect(component.replyForm.value.message).toBeFalsy();
    expect(component.sending()).toBe(false);
    expect(responseService.getByTicket).toHaveBeenCalledTimes(2);
    expect(ticketService.getById).toHaveBeenCalledTimes(2);
    expect(toastService.show).toHaveBeenCalledWith('Reply sent.', 'success');
  });

  it('does not send an empty reply', () => {
    const fixture = createComponent();
    fixture.componentInstance.sendReply();

    expect(responseService.create).not.toHaveBeenCalled();
  });

  it('rejects a reply over 4000 characters', () => {
    const fixture = createComponent();
    fixture.componentInstance.replyForm.controls.message.setValue('x'.repeat(4001));

    expect(fixture.componentInstance.replyForm.controls.message.errors?.['maxlength']).toBeTruthy();
  });

  it('shows the server error inline when sending a reply fails', () => {
    responseService.create.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { detail: 'This ticket is closed and can no longer receive new responses.' } })));
    const fixture = createComponent();
    const component = fixture.componentInstance;
    component.replyForm.setValue({ message: 'One more thing' });

    component.sendReply();

    expect(component.replyError()).toBe('This ticket is closed and can no longer receive new responses.');
    expect(component.sending()).toBe(false);
  });

  it('hides the reply form and shows a notice once the ticket is closed', () => {
    ticketService.getById.mockReturnValue(of({ ...ticket, status: 'Closed' }));
    const fixture = createComponent();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.reply-form')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('This ticket is closed and can no longer receive new replies.');
  });

  it('assigns the ticket to the current agent', () => {
    const fixture = createComponent();
    fixture.componentInstance.assignToSelf();

    expect(ticketService.assignToSelf).toHaveBeenCalledWith('t1');
    expect(fixture.componentInstance.ticket()?.assignedAgentId).toBe('agent1');
    expect(toastService.show).toHaveBeenCalledWith('Ticket assigned to you.', 'success');
  });

  it('shows the server error inline when assigning to self fails', () => {
    ticketService.assignToSelf.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'Could not assign.' } })));
    const fixture = createComponent();
    fixture.componentInstance.assignToSelf();

    expect(fixture.componentInstance.ticketActionError()).toBe('Could not assign.');
  });

  it('shows the server error inline when reassigning fails', () => {
    ticketService.assign.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'Could not reassign.' } })));
    const fixture = createStaffComponent();
    fixture.componentInstance.assignControl.setValue('agent2');

    expect(fixture.componentInstance.ticketActionError()).toBe('Could not reassign.');
  });

  it('labels the current user\'s own response as "You"', () => {
    TestBed.overrideProvider(AuthService, {
      useValue: {
        isAgent: () => false,
        isStaff: () => false,
        isCustomer: () => true,
        currentUser: () => ({ id: 'agent1', email: '', fullName: '', role: 'SupportAgent' }),
      },
    });
    const fixture = createComponent();

    expect(fixture.componentInstance.authorLabel(response)).toBe('You');
  });

  it('labels a staff response from someone else as "Support"', () => {
    const fixture = createComponent();

    expect(fixture.componentInstance.authorLabel(response)).toBe('Support');
  });

  it('labels a customer response from someone else as "Customer"', () => {
    const fixture = createComponent();

    expect(fixture.componentInstance.authorLabel({ ...response, authorRole: 'Customer' })).toBe('Customer');
  });

  it('does not load agents for a non-staff user', () => {
    createComponent();

    expect(ticketService.getAgents).not.toHaveBeenCalled();
  });

  it('loads agents for a staff user', () => {
    const fixture = createStaffComponent();

    expect(ticketService.getAgents).toHaveBeenCalled();
    expect(fixture.componentInstance.agents()).toEqual(agents);
  });

  it('reassigns the ticket to the selected agent', () => {
    const fixture = createStaffComponent();
    fixture.componentInstance.assignControl.setValue('agent2');

    expect(ticketService.assign).toHaveBeenCalledWith('t1', { agentId: 'agent2' });
    expect(fixture.componentInstance.ticket()?.assignedAgentId).toBe('agent2');
    expect(toastService.show).toHaveBeenCalledWith('Ticket reassigned.', 'success');
  });

  it('unassigns the ticket when the selection is cleared', () => {
    const fixture = createStaffComponent();
    fixture.componentInstance.assignControl.setValue('');

    expect(ticketService.assign).toHaveBeenCalledWith('t1', { agentId: null });
    expect(toastService.show).toHaveBeenCalledWith('Ticket unassigned.', 'success');
  });

  it('does not fire an assign request just from loadTicket() setting assignControl programmatically', () => {
    createStaffComponent();

    expect(ticketService.assign).not.toHaveBeenCalled();
  });

  it('shows the already-assigned agent in the rendered <select> even when agents() resolves after the ticket', async () => {
    // Reproduces the reported bug: Ticket Queue shows an assigned agent's name (from
    // AssignedAgentName), but ticket-detail's assign-select showed "Unassigned" because its old
    // bare [value] binding raced the @for-generated <option>s built from agents() (loaded over
    // HTTP, same as here) — the browser found no matching <option> yet, fell back to the first
    // one, and never corrected itself once the real one arrived. Checking the FormControl's own
    // value wouldn't catch this (that part was always correct); the DOM <select>'s .value is
    // where the bug actually showed up.
    vi.useFakeTimers();
    const assignedTicket: Ticket = { ...ticket, assignedAgentId: 'agent1', assignedAgentName: 'Ada Agent' };
    ticketService.getById.mockReturnValue(of(assignedTicket));
    ticketService.getAgents.mockReturnValue(of(agents).pipe(delay(10)));

    const fixture = createStaffComponent();
    fixture.detectChanges();

    await vi.advanceTimersByTimeAsync(10);
    fixture.detectChanges();

    const select: HTMLSelectElement = fixture.nativeElement.querySelector('.assign-select');
    expect(select.value).toBe('agent1');
  });

  it('shows a success toast after a status change', () => {
    const fixture = createStaffComponent();
    fixture.componentInstance.statusControl.setValue('InProgress');

    expect(ticketService.updateStatus).toHaveBeenCalledWith('t1', { status: 'InProgress' });
    expect(toastService.show).toHaveBeenCalledWith('Status updated to InProgress.', 'success');
  });

  it('shows the server error inline and reverts the select when a status change fails', () => {
    ticketService.updateStatus.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409, error: { detail: 'This ticket is closed and its status can no longer be changed.' } })),
    );
    const fixture = createStaffComponent();
    fixture.componentInstance.statusControl.setValue('InProgress');

    expect(fixture.componentInstance.ticketActionError()).toBe(
      'This ticket is closed and its status can no longer be changed.',
    );
    expect(fixture.componentInstance.statusControl.value).toBe('Open');
  });

  it('disables the status select once the ticket is Closed', () => {
    ticketService.getById.mockReturnValue(of({ ...ticket, status: 'Closed' }));
    const fixture = createStaffComponent();

    expect(fixture.componentInstance.statusControl.disabled).toBe(true);
  });

  it('re-enables the status select for a ticket that is not Closed', () => {
    const fixture = createStaffComponent();

    expect(fixture.componentInstance.statusControl.disabled).toBe(false);
  });

  it('styles SupportAgent and Admin responses as staff, but not Customer', () => {
    const responses: TicketResponseMessage[] = [
      { ...response, id: 'r1', authorRole: 'Customer' },
      { ...response, id: 'r2', authorRole: 'SupportAgent' },
      { ...response, id: 'r3', authorRole: 'Admin' },
    ];
    responseService.getByTicket.mockReturnValue(of(responses));

    const fixture = createComponent();
    const cards = fixture.nativeElement.querySelectorAll('.response-card') as NodeListOf<HTMLElement>;

    expect(cards).toHaveLength(3);
    expect(cards[0].classList.contains('agent')).toBe(false);
    expect(cards[1].classList.contains('agent')).toBe(true);
    expect(cards[2].classList.contains('agent')).toBe(true);
  });
});
