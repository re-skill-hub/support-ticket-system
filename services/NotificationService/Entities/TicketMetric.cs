namespace NotificationService.Entities;

public class TicketMetric
{
    public Guid TicketId { get; set; }
    public string CustomerId { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? FirstResponseAtUtc { get; set; }
    public DateTime? ClosedAtUtc { get; set; }
    public string Status { get; set; } = string.Empty;
}
