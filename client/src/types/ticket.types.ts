export type TicketStatus = 'Open' | 'InProgress' | 'Closed';

export interface Ticket {
  id: string;
  title: string;
  description: string;
  customerId: string;
  assignedAgentId: string | null;
  status: TicketStatus;
  createdAtUtc: string;
  updatedAtUtc: string;
  closedAtUtc: string | null;
}

export interface CreateTicketRequest {
  title: string;
  description: string;
}

export interface UpdateTicketStatusRequest {
  status: TicketStatus;
}
