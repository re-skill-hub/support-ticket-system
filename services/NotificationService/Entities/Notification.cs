namespace NotificationService.Entities;

public class Notification
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string RecipientUserId { get; set; } = string.Empty;
    public NotificationType Type { get; set; }
    public string Message { get; set; } = string.Empty;
    public Guid TicketId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ReadAtUtc { get; set; }

    /// <summary>
    /// The MassTransit MessageId of the event that created this notification. Guards
    /// against duplicate inserts if the broker redelivers the same at-least-once
    /// message (e.g. after a transient failure between processing and ack).
    /// </summary>
    public Guid? SourceMessageId { get; set; }
}
