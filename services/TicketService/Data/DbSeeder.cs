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

        foreach (var role in Roles.All)
        {
            if (!await roleManager.RoleExistsAsync(role))
            {
                await roleManager.CreateAsync(new IdentityRole(role));
            }
        }
    }

    public static async Task SeedLocalAgentAsync(this WebApplication app)
    {
        if (!app.Environment.IsDevelopment())
        {
            return;
        }

        using var scope = app.Services.CreateScope();

        var email = app.Configuration["LocalAgent:Email"];
        var password = app.Configuration["LocalAgent:Password"];
        if (string.IsNullOrWhiteSpace(email) && string.IsNullOrWhiteSpace(password))
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            throw new InvalidOperationException("Both LocalAgent:Email and LocalAgent:Password must be configured to seed a local support agent.");
        }

        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = await userManager.FindByEmailAsync(email);
        if (user is null)
        {
            user = new ApplicationUser
            {
                UserName = email,
                Email = email,
                FullName = app.Configuration["LocalAgent:FullName"] ?? "Local Support Agent",
            };

            var createResult = await userManager.CreateAsync(user, password);
            if (!createResult.Succeeded)
            {
                throw new InvalidOperationException($"Could not create the local support agent: {string.Join("; ", createResult.Errors.Select(error => error.Description))}");
            }
        }

        if (!await userManager.IsInRoleAsync(user, Roles.SupportAgent))
        {
            var roleResult = await userManager.AddToRoleAsync(user, Roles.SupportAgent);
            if (!roleResult.Succeeded)
            {
                throw new InvalidOperationException($"Could not assign the local support-agent role: {string.Join("; ", roleResult.Errors.Select(error => error.Description))}");
            }
        }
    }

    public static async Task SeedInitialAdminAsync(this WebApplication app)
    {
        using var scope = app.Services.CreateScope();

        var email = app.Configuration["InitialAdmin:Email"];
        var password = app.Configuration["InitialAdmin:Password"];
        if (string.IsNullOrWhiteSpace(email) && string.IsNullOrWhiteSpace(password))
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            throw new InvalidOperationException("Both InitialAdmin:Email and InitialAdmin:Password must be configured to seed the initial admin account.");
        }

        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = await userManager.FindByEmailAsync(email);
        if (user is null)
        {
            user = new ApplicationUser
            {
                UserName = email,
                Email = email,
                FullName = app.Configuration["InitialAdmin:FullName"] ?? "Initial Admin",
            };

            var createResult = await userManager.CreateAsync(user, password);
            if (!createResult.Succeeded)
            {
                throw new InvalidOperationException($"Could not create the initial admin: {string.Join("; ", createResult.Errors.Select(error => error.Description))}");
            }
        }

        if (!await userManager.IsInRoleAsync(user, Roles.Admin))
        {
            var roleResult = await userManager.AddToRoleAsync(user, Roles.Admin);
            if (!roleResult.Succeeded)
            {
                throw new InvalidOperationException($"Could not assign the initial admin role: {string.Join("; ", roleResult.Errors.Select(error => error.Description))}");
            }
        }
    }
}
