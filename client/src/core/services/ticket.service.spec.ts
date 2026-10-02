import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { Ticket } from '../../types/ticket.types';
import { SILENT_INLINE_ERRORS } from '../interceptors/error.interceptor';
import { TicketService } from './ticket.service';

describe('TicketService', () => {
  let service: TicketService;
  let httpMock: HttpTestingController;
  const baseUrl = `${environment.ticketApiUrl}/tickets`;

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

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TicketService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('create() posts to /tickets', () => {
    service.create({ title: ticket.title, description: ticket.description, priority: 'High', category: 'Technical' }).subscribe((res) => {
      expect(res).toEqual(ticket);
    });

    const req = httpMock.expectOne(baseUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.context.get(SILENT_INLINE_ERRORS)).toBe(true);
    req.flush(ticket);
  });

  it('getMine() gets /tickets/mine', () => {
    service.getMine().subscribe((res) => expect(res).toEqual([ticket]));

    const req = httpMock.expectOne(`${baseUrl}/mine`);
    expect(req.request.method).toBe('GET');
    expect(req.request.context.get(SILENT_INLINE_ERRORS)).toBe(true);
    req.flush([ticket]);
  });

  it('getAll() with no filters sends no query params', () => {
    service.getAll().subscribe();

    const req = httpMock.expectOne((r) => r.url === baseUrl);
    expect(req.request.params.keys().length).toBe(0);
    expect(req.request.context.get(SILENT_INLINE_ERRORS)).toBe(true);
    req.flush([]);
  });

  it('getAll() with filters sends them as query params', () => {
    service.getAll({ status: 'Open', priority: 'High', category: 'Technical', customerId: 'u1' }).subscribe();

    const req = httpMock.expectOne(
      (r) =>
        r.url === baseUrl &&
        r.params.get('status') === 'Open' &&
        r.params.get('priority') === 'High' &&
        r.params.get('category') === 'Technical' &&
        r.params.get('customerId') === 'u1',
    );
    req.flush([]);
  });

  it('getById() gets /tickets/:id', () => {
    service.getById('t1').subscribe((res) => expect(res).toEqual(ticket));

    const req = httpMock.expectOne(`${baseUrl}/t1`);
    expect(req.request.method).toBe('GET');
    req.flush(ticket);
  });

  it('updateStatus() patches /tickets/:id/status', () => {
    service.updateStatus('t1', { status: 'InProgress' }).subscribe();

    const req = httpMock.expectOne(`${baseUrl}/t1/status`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'InProgress' });
    expect(req.request.context.get(SILENT_INLINE_ERRORS)).toBe(true);
    req.flush({ ...ticket, status: 'InProgress' });
  });

  it('assignToSelf() patches /tickets/:id/assign with no body at all', () => {
    service.assignToSelf('t1').subscribe();

    const req = httpMock.expectOne(`${baseUrl}/t1/assign`);
    expect(req.request.method).toBe('PATCH');
    // Must be null, not {}: TicketsController.Assign only takes the "assign to me" branch when
    // the body is truly absent (request is null) — an empty object deserializes to a non-null
    // AssignTicketRequest with AgentId defaulting to null, which the controller reads as
    // "explicit unassign" instead.
    expect(req.request.body).toBeNull();
    expect(req.request.context.get(SILENT_INLINE_ERRORS)).toBe(true);
    req.flush(ticket);
  });

  it('assign() patches /tickets/:id/assign with the target agent id', () => {
    service.assign('t1', { agentId: 'agent-1' }).subscribe();

    const req = httpMock.expectOne(`${baseUrl}/t1/assign`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ agentId: 'agent-1' });
    expect(req.request.context.get(SILENT_INLINE_ERRORS)).toBe(true);
    req.flush(ticket);
  });

  it('getAgents() gets /tickets/agents', () => {
    service.getAgents().subscribe();

    const req = httpMock.expectOne(`${baseUrl}/agents`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
