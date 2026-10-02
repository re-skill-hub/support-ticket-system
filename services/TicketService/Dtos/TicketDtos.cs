using System.ComponentModel.DataAnnotations;
using TicketService.Entities;

namespace TicketService.Dtos;

public record CreateTicketRequest(
    [Required, MaxLength(200)] string Title,
    [Required, MaxLength(4000)] string Description,
    [EnumDataType(typeof(TicketPriority))] TicketPriority Priority,
    [EnumDataType(typeof(TicketCategory))] TicketCategory Category);

public record UpdateTicketStatusRequest([Required, EnumDataType(typeof(TicketStatus))] TicketStatus Status);

public record AssignTicketRequest(string? AgentId);

public record StaffSummaryDto(string Id, string FullName);

public record TicketResponse(
    Guid Id,
    string Title,
    string Description,
    string CustomerId,
    string? AssignedAgentId,
    string? AssignedAgentName,
    TicketStatus Status,
    TicketPriority Priority,
    TicketCategory Category,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc,
    DateTime? ClosedAtUtc)
{
    // assignedAgentName is a display-only lookup resolved by the caller (see
    // TicketsController.ResolveAgentNamesAsync) — a Ticket entity only stores the agent's id.
    public static TicketResponse FromEntity(Ticket ticket, string? assignedAgentName = null) => new(
        ticket.Id,
        ticket.Title,
        ticket.Description,
        ticket.CustomerId,
        ticket.AssignedAgentId,
        assignedAgentName,
        ticket.Status,
        ticket.Priority,
        ticket.Category,
        ticket.CreatedAtUtc,
        ticket.UpdatedAtUtc,
        ticket.ClosedAtUtc);
}
