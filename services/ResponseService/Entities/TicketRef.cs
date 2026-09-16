namespace ResponseService.Entities;

/// <summary>
/// Local read-model projection of a ticket, built entirely from consumed events.
/// Not authoritative — TicketService owns the real ticket.
/// </summary>
public class TicketRef
{
    public Guid TicketId { get; set; }
    public string CustomerId { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }
}
