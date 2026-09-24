export type TicketStatus = 'Open' | 'InProgress' | 'Closed';
export type TicketPriority = 'Low' | 'Medium' | 'High' | 'Urgent';
export type TicketCategory = 'General' | 'Technical' | 'Billing' | 'Account';

export interface Ticket {
  id: string;
  title: string;
  description: string;
  customerId: string;
  assignedAgentId: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  createdAtUtc: string;
  updatedAtUtc: string;
  closedAtUtc: string | null;
}

export interface CreateTicketRequest {
  title: string;
  description: string;
  priority: TicketPriority;
  category: TicketCategory;
}

export interface UpdateTicketStatusRequest {
  status: TicketStatus;
}
