using System.Net;
using System.Net.Mail;

namespace TicketService.Services;

public class SmtpSettings
{
    public string Host { get; set; } = "localhost";
    public int Port { get; set; } = 1025;
    public string FromAddress { get; set; } = "no-reply@support-ticketing.local";
    public string FromName { get; set; } = "Support Ticketing";
}

public class FrontendSettings
{
    public string BaseUrl { get; set; } = "http://localhost:4200";
}

public interface IEmailSender
{
    Task SendAsync(string toAddress, string subject, string body, CancellationToken cancellationToken = default);
}

/// <summary>
/// Plain SMTP sender with no TLS/auth — points at a local Mailpit container in
/// Docker Compose/AKS (see docker-compose.yaml / k8s/08-mailpit.yaml). Swapping to a
/// real provider later is a config change (Smtp:Host/Port + credentials), not a rewrite.
/// </summary>
public class SmtpEmailSender(Microsoft.Extensions.Options.IOptions<SmtpSettings> options) : IEmailSender
{
    private readonly SmtpSettings settings = options.Value;

    public async Task SendAsync(string toAddress, string subject, string body, CancellationToken cancellationToken = default)
    {
        using var client = new SmtpClient(settings.Host, settings.Port);
        using var message = new MailMessage
        {
            From = new MailAddress(settings.FromAddress, settings.FromName),
            Subject = subject,
            Body = body,
            IsBodyHtml = false,
        };
        message.To.Add(new MailAddress(toAddress));

        await client.SendMailAsync(message, cancellationToken);
    }
}
