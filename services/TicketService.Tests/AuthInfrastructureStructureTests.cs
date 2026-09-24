namespace TicketService.Tests;

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
