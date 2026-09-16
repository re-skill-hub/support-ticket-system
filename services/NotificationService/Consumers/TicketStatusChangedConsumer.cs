using Contracts.Events;
using Contracts.Observability;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using NotificationService.Data;
using NotificationService.Entities;

namespace NotificationService.Consumers;

public class TicketStatusChangedConsumer(AppDbContext db, ILogger<TicketStatusChangedConsumer> logger) : IConsumer<TicketStatusChanged>
{
    public async Task Consume(ConsumeContext<TicketStatusChanged> context)
    {
        using var _ = ObservabilityExtensions.PushCorrelationId(context.CorrelationId);

        var message = context.Message;
        var metric = await db.TicketMetrics.FirstOrDefaultAsync(m => m.TicketId == message.TicketId);
        if (metric is null)
        {
            logger.LogWarning("Received TicketStatusChanged for unknown TicketMetric {TicketId}.", message.TicketId);
            return;
        }

        metric.Status = message.NewStatus;
        if (message.NewStatus == "Closed")
        {
            metric.ClosedAtUtc = message.ChangedAtUtc;
        }

        db.Notifications.Add(new Notification
        {
            Type = NotificationType.StatusChanged,
            TicketId = message.TicketId,
            RecipientUserId = message.CustomerId,
            Message = $"Your ticket status changed to {message.NewStatus}.",
        });

        await db.SaveChangesAsync();

        logger.LogInformation("Updated TicketMetric {TicketId} status to {Status}.", message.TicketId, message.NewStatus);
    }
}
