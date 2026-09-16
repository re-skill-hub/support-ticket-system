using Microsoft.AspNetCore.Identity;

namespace TicketService.Entities;

public class ApplicationUser : IdentityUser
{
    public string FullName { get; set; } = string.Empty;
}
