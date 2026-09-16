using Contracts.Events;
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
public class ResponseAddedConsumer(AppDbContext db, ILogger<ResponseAddedConsumer> logger) : IConsumer<ResponseAdded>
{
    public async Task Consume(ConsumeContext<ResponseAdded> context)
    {
        using var _ = ObservabilityExtensions.PushCorrelationId(context.CorrelationId);

        var message = context.Message;
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

        ticket.Status = TicketStatus.InProgress;
        ticket.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync();

        logger.LogInformation("Ticket {TicketId} auto-flipped to InProgress after first response.", ticket.Id);
    }
}
