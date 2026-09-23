using System.Reflection;
using TicketService.Dtos;
using TicketService.Entities;

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
    public void CreateTicketRequest_ValidValues_PassValidation()
    {
        var request = new CreateTicketRequest("Printer is broken", "It won't turn on since this morning.");

        var results = Validate(request);

        Assert.Empty(results);
        Assert.Equal("Printer is broken", request.Title);
        Assert.Equal("It won't turn on since this morning.", request.Description);
    }

    [Theory]
    [InlineData(null, "Description")]
    [InlineData("", "Description")]
    public void CreateTicketRequest_MissingTitle_FailsValidation(string? title, string description)
    {
        var request = new CreateTicketRequest(title!, description);

        var results = Validate(request);

        Assert.Contains(results, r => r.MemberNames.Contains(nameof(CreateTicketRequest.Title)));
    }

    [Fact]
    public void CreateTicketRequest_TitleTooLong_FailsValidation()
    {
        var request = new CreateTicketRequest(new string('a', 201), "Description");

        var results = Validate(request);

        Assert.Contains(results, r => r.MemberNames.Contains(nameof(CreateTicketRequest.Title)));
    }

    [Fact]
    public void CreateTicketRequest_DescriptionTooLong_FailsValidation()
    {
        var request = new CreateTicketRequest("Title", new string('a', 4001));

        var results = Validate(request);

        Assert.Contains(results, r => r.MemberNames.Contains(nameof(CreateTicketRequest.Description)));
    }

    [Fact]
    public void UpdateTicketStatusRequest_HoldsRequestedStatus()
    {
        var request = new UpdateTicketStatusRequest(TicketStatus.InProgress);

        Assert.Equal(TicketStatus.InProgress, request.Status);
    }

    // Record DTOs carry validation attributes on the primary constructor's parameters
    // (required by ASP.NET Core's model binder — see ModelMetadata.ThrowIfRecordTypeHasValidationOnProperties).
    // Validator.TryValidateObject only inspects PropertyInfo, so it can't see them; walk the
    // constructor parameters directly to mirror what the live MVC pipeline actually validates.
    private static List<System.ComponentModel.DataAnnotations.ValidationResult> Validate(object dto)
    {
        var results = new List<System.ComponentModel.DataAnnotations.ValidationResult>();
        var type = dto.GetType();
        var ctor = type.GetConstructors().Single();

        foreach (var parameter in ctor.GetParameters())
        {
            var property = type.GetProperty(parameter.Name!)!;
            var value = property.GetValue(dto);

            foreach (var attribute in parameter.GetCustomAttributes<System.ComponentModel.DataAnnotations.ValidationAttribute>(inherit: true))
            {
                if (!attribute.IsValid(value))
                {
                    results.Add(new System.ComponentModel.DataAnnotations.ValidationResult(
                        attribute.FormatErrorMessage(parameter.Name!),
                        new[] { parameter.Name! }));
                }
            }
        }

        return results;
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
