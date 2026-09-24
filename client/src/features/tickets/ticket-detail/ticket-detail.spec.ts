import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { ResponseService } from '../../../core/services/response.service';
import { TicketService } from '../../../core/services/ticket.service';
import { Ticket } from '../../../types/ticket.types';
import { TicketResponseMessage } from '../../../types/response.types';
import { TicketDetail } from './ticket-detail';

describe('TicketDetail', () => {
  let ticketService: {
    getById: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
    assignToSelf: ReturnType<typeof vi.fn>;
  };
  let responseService: { getByTicket: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };

  const ticket: Ticket = {
    id: 't1',
    title: 'Cannot log in',
    description: 'Password reset link is broken',
    status: 'Open',
    priority: 'High',
    category: 'Technical',
    customerId: 'u1',
    assignedAgentId: null,
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

  beforeEach(async () => {
    ticketService = {
      getById: vi.fn().mockReturnValue(of(ticket)),
      updateStatus: vi.fn().mockReturnValue(of({ ...ticket, status: 'InProgress' })),
      assignToSelf: vi.fn().mockReturnValue(of({ ...ticket, assignedAgentId: 'agent1' })),
    };
    responseService = {
      getByTicket: vi.fn().mockReturnValue(of([response])),
      create: vi.fn().mockReturnValue(of(response)),
    };

    await TestBed.configureTestingModule({
      imports: [TicketDetail],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TicketService, useValue: ticketService },
        { provide: ResponseService, useValue: responseService },
        { provide: AuthService, useValue: { isAgent: () => false, isCustomer: () => true, currentUser: () => null } },
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

  it('loads the ticket and its responses on init', () => {
    const fixture = createComponent();
    const component = fixture.componentInstance;

    expect(ticketService.getById).toHaveBeenCalledWith('t1');
    expect(responseService.getByTicket).toHaveBeenCalledWith('t1');
    expect(component.ticket()).toEqual(ticket);
    expect(component.responses()).toEqual([response]);
    expect(component.loading()).toBe(false);
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
  });

  it('does not send an empty reply', () => {
    const fixture = createComponent();
    fixture.componentInstance.sendReply();

    expect(responseService.create).not.toHaveBeenCalled();
  });

  it('assigns the ticket to the current agent', () => {
    const fixture = createComponent();
    fixture.componentInstance.assignToSelf();

    expect(ticketService.assignToSelf).toHaveBeenCalledWith('t1');
    expect(fixture.componentInstance.ticket()?.assignedAgentId).toBe('agent1');
  });
});
