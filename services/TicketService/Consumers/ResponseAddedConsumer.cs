using Contracts.Events;
using Contracts.Constants;
using Contracts.Observability;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using TicketService.Data;
using TicketService.Entities;

namespace TicketService.Consumers;

/// <summary>
/// Auto-flips a ticket Open -> InProgress on its first response, so support staff
/// don't need to also remember to update status manually.
/// </summary>
public class ResponseAddedConsumer(
    AppDbContext db,
    IPublishEndpoint publishEndpoint,
    ILogger<ResponseAddedConsumer> logger) : IConsumer<ResponseAdded>
{
    public async Task Consume(ConsumeContext<ResponseAdded> context)
    {
        using var _ = ObservabilityExtensions.PushCorrelationId(context.CorrelationId);

        var message = context.Message;
        if (message.AuthorRole != Roles.SupportAgent)
        {
            return;
        }

        var ticket = await db.Tickets.FirstOrDefaultAsync(t => t.Id == message.TicketId);
        if (ticket is null)
        {
            logger.LogWarning("Received ResponseAdded for unknown ticket {TicketId}.", message.TicketId);
            return;
        }

        if (ticket.Status != TicketStatus.Open)
        {
            return;
        }

        var previousStatus = ticket.Status;
        ticket.Status = TicketStatus.InProgress;
        ticket.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await publishEndpoint.Publish(new TicketStatusChanged(
            ticket.Id,
            ticket.CustomerId,
            previousStatus.ToString(),
            ticket.Status.ToString(),
            ticket.UpdatedAtUtc),
            publishContext => publishContext.CorrelationId = context.CorrelationId);

        logger.LogInformation("Ticket {TicketId} auto-flipped to InProgress after first response.", ticket.Id);
    }
}
