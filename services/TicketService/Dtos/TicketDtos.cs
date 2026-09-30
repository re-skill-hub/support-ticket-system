using System.ComponentModel.DataAnnotations;
using TicketService.Entities;

namespace TicketService.Dtos;

public record CreateTicketRequest(
    [Required, MaxLength(200)] string Title,
    [Required, MaxLength(4000)] string Description,
    TicketPriority Priority,
    TicketCategory Category);

public record UpdateTicketStatusRequest(TicketStatus Status);

public record AssignTicketRequest(string? AgentId);

public record StaffSummaryDto(string Id, string FullName);

public record TicketResponse(
    Guid Id,
    string Title,
    string Description,
    string CustomerId,
    string? AssignedAgentId,
    TicketStatus Status,
    TicketPriority Priority,
    TicketCategory Category,
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
        ticket.Priority,
        ticket.Category,
        ticket.CreatedAtUtc,
        ticket.UpdatedAtUtc,
        ticket.ClosedAtUtc);
}
