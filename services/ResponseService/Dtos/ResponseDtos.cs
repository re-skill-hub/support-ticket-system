using System.ComponentModel.DataAnnotations;
using ResponseService.Entities;

namespace ResponseService.Dtos;

public record CreateResponseRequest(
    [Required] Guid TicketId,
    [Required, MaxLength(4000)] string Message);

public record ResponseDto(
    Guid Id,
    Guid TicketId,
    string AuthorUserId,
    string AuthorRole,
    string Message,
    DateTime CreatedAtUtc)
{
    public static ResponseDto FromEntity(Response response) => new(
        response.Id,
        response.TicketId,
        response.AuthorUserId,
        response.AuthorRole,
        response.Message,
        response.CreatedAtUtc);
}
