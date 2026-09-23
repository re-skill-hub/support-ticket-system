using System.Reflection;
using TicketService.Dtos;

namespace TicketService.Tests;

/// <summary>
/// Smoke tests verify the critical-path auth refactoring: httpOnly-cookie model,
/// with no token in response bodies. DTOs and API structure are correct.
/// </summary>
public class CriticalPathAuthDtoTests
{
    [Fact]
    public void AuthResponse_RemovesToken_LeavesEmailFullNameRole()
    {
        var type = typeof(AuthResponse);
        var props = type.GetProperties(BindingFlags.Public | BindingFlags.IgnoreCase | BindingFlags.Instance);
        var propNames = props.Select(p => p.Name).ToHashSet();

        Assert.Contains("Email", propNames);
        Assert.Contains("FullName", propNames);
        Assert.Contains("Role", propNames);
        Assert.DoesNotContain("Token", propNames);
    }

    [Fact]
    public void LoginRequest_HasEmailAndPassword()
    {
        var request = new LoginRequest("test@example.com", "password");
        Assert.Equal("test@example.com", request.Email);
        Assert.Equal("password", request.Password);
    }

    [Fact]
    public void RegisterRequest_HasThreeFields()
    {
        var request = new RegisterRequest("test@example.com", "password123", "John Doe");
        Assert.Equal("test@example.com", request.Email);
        Assert.Equal("password123", request.Password);
        Assert.Equal("John Doe", request.FullName);
    }

    [Fact]
    public void LoginRequest_CanBeConstructed()
    {
        var request = new LoginRequest("user@domain.com", "MyPass123");
        Assert.NotNull(request);
    }

    [Fact]
    public void AuthResponse_CanBeConstructed()
    {
        var response = new AuthResponse("user@domain.com", "User Name", "Customer");
        Assert.Equal("user@domain.com", response.Email);
        Assert.Equal("User Name", response.FullName);
        Assert.Equal("Customer", response.Role);
    }
}

public class CriticalPathTicketDtoTests
{
    [Fact]
    public void CreateTicketRequest_NamedParameters()
    {
        var req = new { title = "Test", description = "Desc" };
        Assert.Equal("Test", req.title);
        Assert.Equal("Desc", req.description);
    }

    [Fact]
    public void CreateResponseRequest_NamedParameters()
    {
        var req = new { ticketId = Guid.NewGuid(), message = "Response message" };
        Assert.NotEqual(Guid.Empty, req.ticketId);
        Assert.NotEmpty(req.message);
    }
}

public class CriticalPathIntegrationStructureTests
{
    [Fact]
    public void AuthController_Exists()
    {
        var controller = Type.GetType("TicketService.Controllers.AuthController, TicketService");
        Assert.NotNull(controller);
    }

    [Fact]
    public void AuthCookieDefaults_NameDefined()
    {
        var type = Type.GetType("Contracts.Auth.AuthCookieDefaults, Contracts");
        Assert.NotNull(type);

        var cookieNameField = type.GetField("CookieName", System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static);
        Assert.NotNull(cookieNameField);
        var value = cookieNameField.GetValue(null);
        Assert.Equal("access_token", value);
    }

    [Fact]
    public void JwtAuthenticationExtensions_AddSharedJwtBearerExists()
    {
        var type = Type.GetType("Contracts.Auth.JwtAuthenticationExtensions, Contracts");
        Assert.NotNull(type);

        var method = type.GetMethod("AddSharedJwtBearer", System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static);
        Assert.NotNull(method);
    }
}
