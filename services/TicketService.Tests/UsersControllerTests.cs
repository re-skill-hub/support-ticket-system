using System.Security.Claims;
using Contracts.Constants;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using TicketService.Controllers;
using TicketService.Data;
using TicketService.Dtos;
using TicketService.Entities;

namespace TicketService.Tests;

public class UsersControllerTests
{
    private static async Task<WebApplication> CreateAppAsync()
    {
        var builder = WebApplication.CreateBuilder();
        var databaseName = Guid.NewGuid().ToString();
        builder.Services.AddDbContext<AppDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services
            .AddIdentityCore<ApplicationUser>(options => options.User.RequireUniqueEmail = true)
            .AddRoles<IdentityRole>()
            .AddEntityFrameworkStores<AppDbContext>();

        var app = builder.Build();
        await app.SeedRolesAsync();
        return app;
    }

    /// <summary>
    /// A real UserManager (backed by the app's real EF store) whose AddToRoleAsync
    /// for <paramref name="failingRole"/> is overridden to return a failed IdentityResult
    /// instead of touching the store — lets tests exercise the controller's failure-handling
    /// branch without relying on store-level quirks (e.g. a missing role throws instead of
    /// returning Failed).
    /// </summary>
    private static UserManager<ApplicationUser> CreateUserManagerFailingRoleAssignment(WebApplication app, string failingRole)
    {
        var scope = app.Services.CreateScope();
        var mock = new Mock<UserManager<ApplicationUser>>(
            scope.ServiceProvider.GetRequiredService<IUserStore<ApplicationUser>>(),
            scope.ServiceProvider.GetRequiredService<IOptions<IdentityOptions>>(),
            scope.ServiceProvider.GetRequiredService<IPasswordHasher<ApplicationUser>>(),
            scope.ServiceProvider.GetRequiredService<IEnumerable<IUserValidator<ApplicationUser>>>(),
            scope.ServiceProvider.GetRequiredService<IEnumerable<IPasswordValidator<ApplicationUser>>>(),
            scope.ServiceProvider.GetRequiredService<ILookupNormalizer>(),
            scope.ServiceProvider.GetRequiredService<IdentityErrorDescriber>(),
            scope.ServiceProvider,
            scope.ServiceProvider.GetRequiredService<ILogger<UserManager<ApplicationUser>>>())
        {
            CallBase = true,
        };

        mock.Setup(m => m.AddToRoleAsync(It.IsAny<ApplicationUser>(), failingRole))
            .ReturnsAsync(IdentityResult.Failed(new IdentityError { Description = $"Could not assign role '{failingRole}'." }));

        return mock.Object;
    }

    private static UsersController CreateController(AppDbContext db, UserManager<ApplicationUser> userManager, string callerId = "admin-1")
    {
        var controller = new UsersController(db, userManager);
        var user = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim(ClaimTypes.NameIdentifier, callerId),
            new Claim(ClaimTypes.Role, Roles.Admin),
        ], "TestAuth"));

        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = user },
        };

        return controller;
    }

    private static async Task<ApplicationUser> SeedUserAsync(UserManager<ApplicationUser> userManager, string email, string role, string password = "Password_123!")
    {
        var user = new ApplicationUser { UserName = email, Email = email, FullName = "Test User" };
        var createResult = await userManager.CreateAsync(user, password);
        Assert.True(createResult.Succeeded);

        var roleResult = await userManager.AddToRoleAsync(user, role);
        Assert.True(roleResult.Succeeded);

        return user;
    }

    [Fact]
    public async Task GetAll_ReturnsPagedResults()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        await SeedUserAsync(userManager, "a@test.local", Roles.Customer);
        await SeedUserAsync(userManager, "b@test.local", Roles.SupportAgent);
        await SeedUserAsync(userManager, "c@test.local", Roles.Admin);

        var controller = CreateController(db, userManager);

        var result = await controller.GetAll(role: null, page: 1, pageSize: 2);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var page = Assert.IsType<PagedResult<UserSummaryDto>>(ok.Value);
        Assert.Equal(3, page.TotalCount);
        Assert.Equal(2, page.Items.Count);
    }

    [Fact]
    public async Task GetAll_FiltersByRole()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        await SeedUserAsync(userManager, "a@test.local", Roles.Customer);
        await SeedUserAsync(userManager, "b@test.local", Roles.SupportAgent);

        var controller = CreateController(db, userManager);

        var result = await controller.GetAll(role: Roles.SupportAgent, page: 1, pageSize: 20);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var page = Assert.IsType<PagedResult<UserSummaryDto>>(ok.Value);
        Assert.Single(page.Items);
        Assert.Equal("b@test.local", page.Items[0].Email);
    }

    [Fact]
    public async Task GetAll_RolelessUser_AppearsWithSentinel()
    {
        // Regression test for the GetAll inner-join visibility gap: a user with no
        // UserRoles row (reachable via Bug B before its fix, or a future DB edit)
        // must still be visible in the paged list, not silently excluded.
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var roleless = new ApplicationUser { UserName = "roleless@test.local", Email = "roleless@test.local", FullName = "Roleless User" };
        var createResult = await userManager.CreateAsync(roleless, "Password_123!");
        Assert.True(createResult.Succeeded);

        var controller = CreateController(db, userManager);

        var result = await controller.GetAll(role: null, page: 1, pageSize: 20);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var page = Assert.IsType<PagedResult<UserSummaryDto>>(ok.Value);
        var dto = Assert.Single(page.Items, item => item.Email == "roleless@test.local");
        Assert.Equal("(no role)", dto.Role);
    }

    [Fact]
    public async Task GetById_UnknownUser_ReturnsNotFound()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var controller = CreateController(db, userManager);

        var result = await controller.GetById("missing-id");

        Assert.IsType<NotFoundResult>(result.Result);
    }

    [Fact]
    public async Task GetById_KnownUser_ReturnsSummary()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = await SeedUserAsync(userManager, "known@test.local", Roles.SupportAgent);
        var controller = CreateController(db, userManager);

        var result = await controller.GetById(user.Id);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var dto = Assert.IsType<UserSummaryDto>(ok.Value);
        Assert.Equal(user.Id, dto.Id);
        Assert.Equal(Roles.SupportAgent, dto.Role);
    }

    [Fact]
    public async Task Create_Valid_AssignsRoleAndReturnsCreated()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var controller = CreateController(db, userManager);

        var result = await controller.Create(new CreateUserRequest("new@test.local", "Password_123!", "New User", Roles.SupportAgent));

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        var dto = Assert.IsType<UserSummaryDto>(created.Value);
        Assert.Equal(Roles.SupportAgent, dto.Role);

        var user = await userManager.FindByEmailAsync("new@test.local");
        Assert.NotNull(user);
        Assert.True(await userManager.IsInRoleAsync(user!, Roles.SupportAgent));
    }

    [Fact]
    public async Task Create_DuplicateEmail_ReturnsBadRequestWithIdentityErrors()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        await SeedUserAsync(userManager, "dupe@test.local", Roles.Customer);
        var controller = CreateController(db, userManager);

        var result = await controller.Create(new CreateUserRequest("dupe@test.local", "Password_123!", "Someone Else", Roles.Customer));

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        var errors = Assert.IsAssignableFrom<IEnumerable<string>>(badRequest.Value);
        Assert.NotEmpty(errors);
    }

    [Fact]
    public async Task Create_UnknownRole_ReturnsBadRequest()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var controller = CreateController(db, userManager);

        var result = await controller.Create(new CreateUserRequest("new@test.local", "Password_123!", "New User", "SuperAdmin"));

        Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Null(await userManager.FindByEmailAsync("new@test.local"));
    }

    [Fact]
    public async Task Create_RoleAssignmentFailure_DeletesUserAndReturnsBadRequest()
    {
        // Regression test for Bug A: AddToRoleAsync fails after CreateAsync already
        // succeeded — the user must not be left behind roleless.
        await using var app = await CreateAppAsync();
        var userManager = CreateUserManagerFailingRoleAssignment(app, Roles.SupportAgent);
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var controller = CreateController(db, userManager);

        var result = await controller.Create(new CreateUserRequest("orphan@test.local", "Password_123!", "New User", Roles.SupportAgent));

        Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Null(await userManager.FindByEmailAsync("orphan@test.local"));
    }

    [Fact]
    public async Task ChangeRole_Self_ReturnsConflict()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var self = await SeedUserAsync(userManager, "self@test.local", Roles.Admin);
        var controller = CreateController(db, userManager, callerId: self.Id);

        var result = await controller.ChangeRole(self.Id, new ChangeUserRoleRequest(Roles.SupportAgent));

        Assert.IsType<ConflictObjectResult>(result.Result);
    }

    [Fact]
    public async Task ChangeRole_UnknownUser_ReturnsNotFound()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var controller = CreateController(db, userManager);

        var result = await controller.ChangeRole("missing-id", new ChangeUserRoleRequest(Roles.SupportAgent));

        Assert.IsType<NotFoundResult>(result.Result);
    }

    [Fact]
    public async Task ChangeRole_ValidSwap_ReplacesRole()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var target = await SeedUserAsync(userManager, "target@test.local", Roles.SupportAgent);
        var controller = CreateController(db, userManager);

        var result = await controller.ChangeRole(target.Id, new ChangeUserRoleRequest(Roles.Admin));

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var dto = Assert.IsType<UserSummaryDto>(ok.Value);
        Assert.Equal(Roles.Admin, dto.Role);

        var roles = await userManager.GetRolesAsync(target);
        Assert.Equal([Roles.Admin], roles);
    }

    [Fact]
    public async Task ChangeRole_AddFailure_RestoresOriginalRole()
    {
        // Regression test for Bug B: RemoveFromRolesAsync succeeds but the subsequent
        // AddToRoleAsync fails — the user must end up back in their original role(s),
        // never with zero roles.
        await using var app = await CreateAppAsync();
        using var seedScope = app.Services.CreateScope();
        var seedUserManager = seedScope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var target = await SeedUserAsync(seedUserManager, "target@test.local", Roles.SupportAgent);

        var userManager = CreateUserManagerFailingRoleAssignment(app, Roles.Admin);
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var controller = CreateController(db, userManager);

        var result = await controller.ChangeRole(target.Id, new ChangeUserRoleRequest(Roles.Admin));

        Assert.IsType<BadRequestObjectResult>(result.Result);
        var roles = await userManager.GetRolesAsync(target);
        Assert.Equal([Roles.SupportAgent], roles);
    }

    [Fact]
    public async Task SetActive_Self_ReturnsConflict()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var self = await SeedUserAsync(userManager, "self@test.local", Roles.Admin);
        var controller = CreateController(db, userManager, callerId: self.Id);

        var result = await controller.SetActive(self.Id, new SetUserActiveRequest(false));

        Assert.IsType<ConflictObjectResult>(result.Result);
    }

    [Fact]
    public async Task SetActive_Deactivate_LocksOutUser()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var target = await SeedUserAsync(userManager, "target@test.local", Roles.SupportAgent);
        var controller = CreateController(db, userManager);

        var result = await controller.SetActive(target.Id, new SetUserActiveRequest(false));

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.False(Assert.IsType<UserSummaryDto>(ok.Value).IsActive);
        Assert.True(await userManager.IsLockedOutAsync(target));
    }

    [Fact]
    public async Task SetActive_Reactivate_ClearsLockout()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var target = await SeedUserAsync(userManager, "target@test.local", Roles.SupportAgent);
        await userManager.SetLockoutEnabledAsync(target, true);
        await userManager.SetLockoutEndDateAsync(target, DateTimeOffset.MaxValue);
        var controller = CreateController(db, userManager);

        var result = await controller.SetActive(target.Id, new SetUserActiveRequest(true));

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.True(Assert.IsType<UserSummaryDto>(ok.Value).IsActive);
        Assert.False(await userManager.IsLockedOutAsync(target));
    }
}
