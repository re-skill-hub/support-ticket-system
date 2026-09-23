using System.ComponentModel.DataAnnotations;
using TicketService.Entities;

namespace TicketService.Dtos;

public record CreateTicketRequest(
    [property: Required, MaxLength(200)] string Title,
    [property: Required, MaxLength(4000)] string Description);

public record UpdateTicketStatusRequest(TicketStatus Status);

public record TicketResponse(
    Guid Id,
    string Title,
    string Description,
    string CustomerId,
    string? AssignedAgentId,
    TicketStatus Status,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc,
    DateTime? ClosedAtUtc)
{
    public static TicketResponse FromEntity(Ticket ticket) => new(
        ticket.Id,
        ticket.Title,
        ticket.Description,
        ticket.CustomerId,
        ticket.AssignedAgentId,
        ticket.Status,
        ticket.CreatedAtUtc,
        ticket.UpdatedAtUtc,
        ticket.ClosedAtUtc);
}
