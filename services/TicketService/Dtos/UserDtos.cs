using System.ComponentModel.DataAnnotations;

namespace TicketService.Dtos;

public record UserSummaryDto(
    string Id,
    string Email,
    string FullName,
    string Role,
    bool IsActive,
    DateTime CreatedAtUtc);

public record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount);

public record CreateUserRequest(
    [Required, EmailAddress] string Email,
    [Required, MinLength(8)] string Password,
    [Required, MaxLength(200)] string FullName,
    [Required] string Role);

public record ChangeUserRoleRequest([Required] string Role);

public record SetUserActiveRequest(bool IsActive);
