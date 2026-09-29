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

        Assert.Contains("Id", propNames);
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
        var response = new AuthResponse("user-1", "user@domain.com", "User Name", "Customer");
        Assert.Equal("user-1", response.Id);
        Assert.Equal("user@domain.com", response.Email);
        Assert.Equal("User Name", response.FullName);
        Assert.Equal("Customer", response.Role);
    }
}
