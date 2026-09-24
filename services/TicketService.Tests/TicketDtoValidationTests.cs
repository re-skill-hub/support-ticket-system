using System.Reflection;
using TicketService.Dtos;
using TicketService.Entities;

namespace TicketService.Tests;

public class CriticalPathTicketDtoTests
{
    [Fact]
    public void CreateTicketRequest_ValidValues_PassValidation()
    {
        var request = new CreateTicketRequest("Printer is broken", "It won't turn on since this morning.", TicketPriority.Medium, TicketCategory.Technical);

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
        var request = new CreateTicketRequest(title!, description, TicketPriority.Medium, TicketCategory.General);

        var results = Validate(request);

        Assert.Contains(results, r => r.MemberNames.Contains(nameof(CreateTicketRequest.Title)));
    }

    [Fact]
    public void CreateTicketRequest_TitleTooLong_FailsValidation()
    {
        var request = new CreateTicketRequest(new string('a', 201), "Description", TicketPriority.Medium, TicketCategory.General);

        var results = Validate(request);

        Assert.Contains(results, r => r.MemberNames.Contains(nameof(CreateTicketRequest.Title)));
    }

    [Fact]
    public void CreateTicketRequest_DescriptionTooLong_FailsValidation()
    {
        var request = new CreateTicketRequest("Title", new string('a', 4001), TicketPriority.Medium, TicketCategory.General);

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
