using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore;
using TicketService.Data;
using TicketService.Entities;

namespace TicketService.Tests;

public class DbSeederTests
{
    [Fact]
    public async Task SeedLocalAgentAsync_CreatesConfiguredAgentIdempotently()
    {
        await using var app = CreateApp("Development", new Dictionary<string, string?>
        {
            ["LocalAgent:Email"] = "agent@example.test",
            ["LocalAgent:Password"] = "Local-Only-123!",
        });

        await app.SeedRolesAsync();
        await app.SeedLocalAgentAsync();
        await app.SeedLocalAgentAsync();

        using var scope = app.Services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var agent = await userManager.FindByEmailAsync("agent@example.test");

        Assert.NotNull(agent);
        Assert.True(await userManager.IsInRoleAsync(agent, "SupportAgent"));
    }

    [Fact]
    public async Task SeedLocalAgentAsync_CreatesAgentOutsideDevelopmentWhenConfigured()
    {
        // Mirrors SeedInitialAdminAsync: seeding is gated purely on configuration being
        // present, not on the hosting environment, so a CI/e2e environment can opt in by
        // setting LocalAgent:Email/Password without also having to run in Development mode.
        await using var app = CreateApp("Production", new Dictionary<string, string?>
        {
            ["LocalAgent:Email"] = "agent@example.test",
            ["LocalAgent:Password"] = "Local-Only-123!",
        });

        await app.SeedRolesAsync();
        await app.SeedLocalAgentAsync();

        using var scope = app.Services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var agent = await userManager.FindByEmailAsync("agent@example.test");

        Assert.NotNull(agent);
        Assert.True(await userManager.IsInRoleAsync(agent, "SupportAgent"));
    }

    [Fact]
    public async Task SeedLocalAgentAsync_SkipsSilentlyWhenNotConfigured()
    {
        await using var app = CreateApp("Development", new Dictionary<string, string?>());

        await app.SeedRolesAsync();
        await app.SeedLocalAgentAsync();

        using var scope = app.Services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        Assert.Null(await userManager.FindByEmailAsync("agent@example.test"));
    }

    [Fact]
    public async Task SeedInitialAdminAsync_CreatesConfiguredAdminIdempotently()
    {
        await using var app = CreateApp("Production", new Dictionary<string, string?>
        {
            ["InitialAdmin:Email"] = "admin@example.test",
            ["InitialAdmin:Password"] = "Initial-Admin-123!",
        });

        await app.SeedRolesAsync();
        await app.SeedInitialAdminAsync();
        await app.SeedInitialAdminAsync();

        using var scope = app.Services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var admin = await userManager.FindByEmailAsync("admin@example.test");

        Assert.NotNull(admin);
        Assert.True(await userManager.IsInRoleAsync(admin, "Admin"));
    }

    [Fact]
    public async Task SeedInitialAdminAsync_SkipsSilentlyWhenNotConfigured()
    {
        await using var app = CreateApp("Production", new Dictionary<string, string?>());

        await app.SeedRolesAsync();
        await app.SeedInitialAdminAsync();

        using var scope = app.Services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        Assert.Null(await userManager.FindByEmailAsync("admin@example.test"));
    }

    [Fact]
    public async Task SeedInitialAdminAsync_ThrowsWhenOnlyOneValueConfigured()
    {
        await using var app = CreateApp("Production", new Dictionary<string, string?>
        {
            ["InitialAdmin:Email"] = "admin@example.test",
        });

        await Assert.ThrowsAsync<InvalidOperationException>(() => app.SeedInitialAdminAsync());
    }

    [Fact]
    public async Task SeedInitialAdminAsync_ConcurrentInvocations_CreateExactlyOneUser()
    {
        // Regression test for the check-then-act race in EnsureSeededUserWithRoleAsync:
        // two concurrent calls both see no existing user and both attempt CreateAsync;
        // the loser must recover via the unique-index DbUpdateException catch instead
        // of throwing, and both calls must end up agreeing on the same single user/role.
        await using var app = CreateApp("Production", new Dictionary<string, string?>
        {
            ["InitialAdmin:Email"] = "admin@example.test",
            ["InitialAdmin:Password"] = "Initial-Admin-123!",
        });

        await app.SeedRolesAsync();

        await Task.WhenAll(app.SeedInitialAdminAsync(), app.SeedInitialAdminAsync());

        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        Assert.Equal(1, await db.Users.CountAsync());
        var admin = await userManager.FindByEmailAsync("admin@example.test");
        Assert.NotNull(admin);
        Assert.True(await userManager.IsInRoleAsync(admin, "Admin"));
    }

    private static WebApplication CreateApp(string environment, Dictionary<string, string?> settings)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = environment });
        builder.Configuration.AddInMemoryCollection(settings);
        var databaseName = Guid.NewGuid().ToString();
        builder.Services.AddDbContext<AppDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services
            .AddIdentityCore<ApplicationUser>()
            .AddRoles<IdentityRole>()
            .AddEntityFrameworkStores<AppDbContext>();

        return builder.Build();
    }
}