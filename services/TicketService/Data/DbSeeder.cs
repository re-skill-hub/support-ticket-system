using Contracts.Constants;
using Microsoft.AspNetCore.Identity;
using TicketService.Entities;

namespace TicketService.Data;

public static class DbSeeder
{
    private const string DefaultAgentEmail = "agent@support.local";
    private const string DefaultAgentPassword = "Agent#Pass123";

    /// <summary>
    /// Ensures both roles exist and a default SupportAgent account is available, so
    /// there's a support-staff login without a manual admin step. Credentials are
    /// documented in the README.
    /// </summary>
    public static async Task SeedRolesAndDefaultAgentAsync(this WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        foreach (var role in new[] { Roles.Customer, Roles.SupportAgent })
        {
            if (!await roleManager.RoleExistsAsync(role))
            {
                await roleManager.CreateAsync(new IdentityRole(role));
            }
        }

        if (await userManager.FindByEmailAsync(DefaultAgentEmail) is not null)
        {
            return;
        }

        var agent = new ApplicationUser
        {
            UserName = DefaultAgentEmail,
            Email = DefaultAgentEmail,
            FullName = "Default Support Agent",
            EmailConfirmed = true,
        };

        var result = await userManager.CreateAsync(agent, DefaultAgentPassword);
        if (result.Succeeded)
        {
            await userManager.AddToRoleAsync(agent, Roles.SupportAgent);
        }
    }
}
