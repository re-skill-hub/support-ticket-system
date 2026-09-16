using ResponseService.Entities;

namespace ResponseService.Dtos;

public record CreateResponseRequest(Guid TicketId, string Message);

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
