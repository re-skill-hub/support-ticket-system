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
    public async Task SeedRolesAsync_CreatesConfiguredDevelopmentAgentIdempotently()
    {
        await using var app = CreateApp("Development", new Dictionary<string, string?>
        {
            ["LocalAgent:Email"] = "agent@example.test",
            ["LocalAgent:Password"] = "Local-Only-123!",
        });

        await app.SeedRolesAsync();
        await app.SeedRolesAsync();

        using var scope = app.Services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var agent = await userManager.FindByEmailAsync("agent@example.test");

        Assert.NotNull(agent);
        Assert.True(await userManager.IsInRoleAsync(agent, "SupportAgent"));
    }

    [Fact]
    public async Task SeedRolesAsync_DoesNotCreateAgentOutsideDevelopment()
    {
        await using var app = CreateApp("Production", new Dictionary<string, string?>
        {
            ["LocalAgent:Email"] = "agent@example.test",
            ["LocalAgent:Password"] = "Local-Only-123!",
        });

        await app.SeedRolesAsync();

        using var scope = app.Services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        Assert.Null(await userManager.FindByEmailAsync("agent@example.test"));
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