using System.Security.Claims;
using Contracts.Constants;

namespace Contracts.Auth;

public static class ClaimsPrincipalExtensions
{
    public static string GetUserId(this ClaimsPrincipal principal) =>
        principal.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? throw new InvalidOperationException("User has no NameIdentifier claim.");

    public static bool IsStaff(this ClaimsPrincipal principal) =>
        principal.IsInRole(Roles.SupportAgent) || principal.IsInRole(Roles.Admin);
}
