using Contracts.Constants;
using Contracts.Events;
using Contracts.ExceptionHandling;
using Contracts.Messaging;
using Contracts.Observability;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using NotificationService.Data;
using NotificationService.Entities;

namespace NotificationService.Consumers;

public class ResponseAddedConsumer(AppDbContext db, ILogger<ResponseAddedConsumer> logger) : IConsumer<ResponseAdded>
{
    public async Task Consume(ConsumeContext<ResponseAdded> context)
    {
        using var _ = ObservabilityExtensions.PushCorrelationId(context.CorrelationId);

        var message = context.Message;

        if (!Roles.IsStaff(message.AuthorRole))
        {
            return;
        }

        var messageId = context.MessageId ?? Guid.NewGuid();
        if (await ConsumedMessageGuard.AlreadyProcessedAsync(db.Notifications, messageId))
        {
            logger.LogInformation("Duplicate delivery of ResponseAdded {MessageId}; skipping.", messageId);
            return;
        }

        var metric = await db.TicketMetrics.FirstOrDefaultAsync(m => m.TicketId == message.TicketId);
        if (metric is null)
        {
            logger.LogWarning("Received ResponseAdded for unknown TicketMetric {TicketId}; will retry.", message.TicketId);
            throw new ProjectionNotReadyException($"TicketMetric {message.TicketId} has not been projected yet.");
        }

        if (metric.FirstResponseAtUtc is null)
        {
            metric.FirstResponseAtUtc = message.CreatedAtUtc;
        }

        db.Notifications.Add(new Notification
        {
            Type = NotificationType.NewResponse,
            TicketId = message.TicketId,
            RecipientUserId = metric.CustomerId,
            Message = "A support agent replied to your ticket.",
            SourceMessageId = messageId,
        });

        await db.SaveChangesAsync();

        logger.LogInformation("Recorded response notification for ticket {TicketId}.", message.TicketId);
    }
}
