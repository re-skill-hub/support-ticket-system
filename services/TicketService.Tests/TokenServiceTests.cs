using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Contracts.Auth;
using Contracts.Constants;
using TicketService.Entities;
using TicketService.Services;

namespace TicketService.Tests;

public class TokenServiceTests
{
    private static readonly JwtSettings Settings = new()
    {
        Secret = "unit-test-signing-key-at-least-32-characters-long",
        Issuer = "support-ticket-system",
        Audience = "support-ticket-system-clients",
        AccessTokenMinutes = 30,
    };

    [Fact]
    public void CreateToken_IncludesUserIdentityAndRoleClaims()
    {
        var tokenService = new TokenService(Settings);
        var user = new ApplicationUser
        {
            Id = "user-123",
            Email = "agent@support.local",
            FullName = "Sam Agent",
        };

        var token = tokenService.CreateToken(user, [Roles.SupportAgent]);

        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);
        Assert.Equal("user-123", jwt.Claims.Single(c => c.Type == ClaimTypes.NameIdentifier).Value);
        Assert.Equal("agent@support.local", jwt.Claims.Single(c => c.Type == ClaimTypes.Email).Value);
        Assert.Equal("Sam Agent", jwt.Claims.Single(c => c.Type == "fullName").Value);
        Assert.Equal(Roles.SupportAgent, jwt.Claims.Single(c => c.Type == ClaimTypes.Role).Value);
    }

    [Fact]
    public void CreateToken_MultipleRoles_AddsClaimPerRole()
    {
        var tokenService = new TokenService(Settings);
        var user = new ApplicationUser { Id = "user-1", Email = "u@x.com", FullName = "U" };

        var token = tokenService.CreateToken(user, [Roles.Customer, Roles.SupportAgent]);

        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);
        var roleClaims = jwt.Claims.Where(c => c.Type == ClaimTypes.Role).Select(c => c.Value).ToList();
        Assert.Contains(Roles.Customer, roleClaims);
        Assert.Contains(Roles.SupportAgent, roleClaims);
    }

    [Fact]
    public void CreateToken_SetsIssuerAudienceAndExpiry()
    {
        var tokenService = new TokenService(Settings);
        var user = new ApplicationUser { Id = "user-1", Email = "u@x.com", FullName = "U" };
        var before = DateTime.UtcNow;

        var token = tokenService.CreateToken(user, [Roles.Customer]);

        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);
        Assert.Equal(Settings.Issuer, jwt.Issuer);
        Assert.Equal(Settings.Audience, jwt.Audiences.Single());
        Assert.True(jwt.ValidTo > before.AddMinutes(Settings.AccessTokenMinutes - 1));
        Assert.True(jwt.ValidTo <= before.AddMinutes(Settings.AccessTokenMinutes + 1));
    }
}
