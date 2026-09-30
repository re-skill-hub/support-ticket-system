using Contracts.Auth;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Moq;
using TicketService.Controllers;
using TicketService.Data;
using TicketService.Dtos;
using TicketService.Entities;
using TicketService.Services;

namespace TicketService.Tests;

public class AuthControllerTests
{
    private static async Task<WebApplication> CreateAppAsync()
    {
        var builder = WebApplication.CreateBuilder();
        var databaseName = Guid.NewGuid().ToString();
        builder.Services.AddDbContext<AppDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddDataProtection();
        builder.Services.AddAuthentication();
        builder.Services
            .AddIdentityCore<ApplicationUser>(options =>
            {
                options.Password.RequiredLength = 8;
                options.User.RequireUniqueEmail = true;
            })
            .AddRoles<IdentityRole>()
            .AddEntityFrameworkStores<AppDbContext>()
            .AddSignInManager()
            .AddDefaultTokenProviders();

        var app = builder.Build();
        await app.SeedRolesAsync();
        return app;
    }

    private static AuthController CreateController(
        WebApplication app,
        UserManager<ApplicationUser> userManager,
        Mock<IEmailSender> emailSender)
    {
        var jwtSettings = new JwtSettings { Secret = "unit-test-signing-secret-32chars!!", Issuer = "test", Audience = "test" };
        return new AuthController(
            userManager,
            app.Services.GetRequiredService<SignInManager<ApplicationUser>>(),
            new TokenService(jwtSettings),
            jwtSettings,
            app.Services.GetRequiredService<IHostEnvironment>(),
            emailSender.Object,
            new FrontendSettings { BaseUrl = "http://localhost:4200" });
    }

    private static async Task<ApplicationUser> SeedUserAsync(UserManager<ApplicationUser> userManager, string email, string password = "Password_123!")
    {
        var user = new ApplicationUser { UserName = email, Email = email, FullName = "Test User" };
        var result = await userManager.CreateAsync(user, password);
        Assert.True(result.Succeeded);
        return user;
    }

    [Fact]
    public async Task ForgotPassword_UnknownEmail_ReturnsOkWithoutSendingEmail()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var emailSender = new Mock<IEmailSender>();
        var controller = CreateController(app, userManager, emailSender);

        var result = await controller.ForgotPassword(new ForgotPasswordRequest("nobody@test.local"));

        Assert.IsType<OkResult>(result);
        emailSender.Verify(
            e => e.SendAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task ForgotPassword_KnownEmail_SendsResetEmailAndReturnsOk()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        await SeedUserAsync(userManager, "known@test.local");

        var emailSender = new Mock<IEmailSender>();
        var controller = CreateController(app, userManager, emailSender);

        var result = await controller.ForgotPassword(new ForgotPasswordRequest("known@test.local"));

        Assert.IsType<OkResult>(result);
        emailSender.Verify(
            e => e.SendAsync(
                "known@test.local",
                It.IsAny<string>(),
                It.Is<string>(body => body.Contains("http://localhost:4200/reset-password")),
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task ResetPassword_ValidToken_ResetsPasswordAndReturnsOk()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = await SeedUserAsync(userManager, "reset@test.local");
        var token = await userManager.GeneratePasswordResetTokenAsync(user);

        var controller = CreateController(app, userManager, new Mock<IEmailSender>());

        var result = await controller.ResetPassword(new ResetPasswordRequest("reset@test.local", token, "NewPassword_123!"));

        Assert.IsType<OkResult>(result);
        Assert.True(await userManager.CheckPasswordAsync(user, "NewPassword_123!"));
    }

    [Fact]
    public async Task ResetPassword_InvalidToken_ReturnsBadRequest()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        await SeedUserAsync(userManager, "reset2@test.local");

        var controller = CreateController(app, userManager, new Mock<IEmailSender>());

        var result = await controller.ResetPassword(new ResetPasswordRequest("reset2@test.local", "not-a-real-token", "NewPassword_123!"));

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task ResetPassword_UnknownEmail_ReturnsBadRequest()
    {
        await using var app = await CreateAppAsync();
        using var scope = app.Services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        var controller = CreateController(app, userManager, new Mock<IEmailSender>());

        var result = await controller.ResetPassword(new ResetPasswordRequest("nobody@test.local", "some-token", "NewPassword_123!"));

        Assert.IsType<BadRequestObjectResult>(result);
    }
}
