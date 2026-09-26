using Contracts.Constants;
using Microsoft.AspNetCore.Identity;
using TicketService.Entities;

namespace TicketService.Data;

public static class DbSeeder
{
    public static async Task SeedRolesAsync(this WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();

        foreach (var role in new[] { Roles.Customer, Roles.SupportAgent })
        {
            if (!await roleManager.RoleExistsAsync(role))
            {
                await roleManager.CreateAsync(new IdentityRole(role));
            }
        }
    }
}
