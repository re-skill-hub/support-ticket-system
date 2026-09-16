export interface TicketResponseMessage {
  id: string;
  ticketId: string;
  authorUserId: string;
  authorRole: string;
  message: string;
  createdAtUtc: string;
}

export interface CreateResponseRequest {
  ticketId: string;
  message: string;
}
