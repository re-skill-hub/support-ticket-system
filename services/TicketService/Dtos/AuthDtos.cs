using System.ComponentModel.DataAnnotations;

namespace TicketService.Dtos;

public record RegisterRequest(
    [property: Required, EmailAddress] string Email,
    [property: Required, MinLength(8)] string Password,
    [property: Required, MaxLength(200)] string FullName);

public record LoginRequest(
    [property: Required, EmailAddress] string Email,
    [property: Required] string Password);

public record AuthResponse(string Email, string FullName, string Role);
