using Contracts.Constants;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using TicketService.Entities;

namespace TicketService.Data;

public static class DbSeeder
{
    /// <summary>
    /// Idempotently ensures a user with the given email/role exists. FindByEmailAsync-then-
    /// CreateAsync is a check-then-act race under concurrent invocation (e.g. multiple pod
    /// replicas starting simultaneously): if another instance wins the race, CreateAsync
    /// throws a DbUpdateException from the unique username index rather than returning a
    /// failed IdentityResult, so we catch it and re-resolve the winner's user instead of
    /// failing startup. Same reasoning applies to the role assignment below it.
    /// </summary>
    private static async Task<ApplicationUser> EnsureSeededUserWithRoleAsync(
        UserManager<ApplicationUser> userManager, string email, string password, string fullName, string role, string failureContext)
    {
        var user = await userManager.FindByEmailAsync(email);
        if (user is null)
        {
            user = new ApplicationUser { UserName = email, Email = email, FullName = fullName };

            try
            {
                var createResult = await userManager.CreateAsync(user, password);
                if (!createResult.Succeeded)
                {
                    throw new InvalidOperationException($"Could not create {failureContext}: {string.Join("; ", createResult.Errors.Select(error => error.Description))}");
                }
            }
            catch (DbUpdateException)
            {
                user = await userManager.FindByEmailAsync(email)
                    ?? throw new InvalidOperationException($"Creation of {failureContext} raced with a concurrent seeder and the resulting user could not be found.");
            }
        }

        if (!await userManager.IsInRoleAsync(user, role))
        {
            try
            {
                var roleResult = await userManager.AddToRoleAsync(user, role);
                if (!roleResult.Succeeded)
                {
                    throw new InvalidOperationException($"Could not assign the {failureContext} role: {string.Join("; ", roleResult.Errors.Select(error => error.Description))}");
                }
            }
            catch (DbUpdateException)
            {
                // Another concurrent instance already assigned the role; nothing left to do.
            }
        }

        return user;
    }

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
        await EnsureSeededUserWithRoleAsync(
            userManager,
            email,
            password,
            app.Configuration["LocalAgent:FullName"] ?? "Local Support Agent",
            Roles.SupportAgent,
            "the local support agent");
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
        await EnsureSeededUserWithRoleAsync(
            userManager,
            email,
            password,
            app.Configuration["InitialAdmin:FullName"] ?? "Initial Admin",
            Roles.Admin,
            "the initial admin");
    }
}
