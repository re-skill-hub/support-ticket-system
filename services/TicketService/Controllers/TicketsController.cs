using Contracts.Auth;
using Contracts.Constants;
using Contracts.Events;
using Contracts.Observability;
using Contracts.Resilience;
using MassTransit;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Polly.Registry;
using TicketService.Data;
using TicketService.Dtos;
using TicketService.Entities;

namespace TicketService.Controllers;

[ApiController]
[Route("api/tickets")]
[Authorize]
public class TicketsController(
    AppDbContext db,
    IPublishEndpoint publishEndpoint,
    UserManager<ApplicationUser> userManager,
    ResiliencePipelineProvider<string> resiliencePipelines,
    ILogger<TicketsController> logger) : ControllerBase
{
    /// <summary>
    /// Publishes an event with the shared "publish" resilience pipeline (retry only — no
    /// circuit breaker/timeout, so a failure surfaces fast rather than holding the HTTP request
    /// open). The DB write this follows has already committed, so a final failure here is logged
    /// Critical and surfaced as 503: the primary operation succeeded but a downstream side effect
    /// (notifications, projections) did not. Known residual risk, not fixed here: this isn't
    /// atomic with the DB write (no transactional outbox) — see plan.
    /// </summary>
    private async Task<ActionResult?> TryPublishAsync(Func<CancellationToken, Task> publish, Guid ticketId, string eventName, CancellationToken cancellationToken)
    {
        try
        {
            var pipeline = resiliencePipelines.GetPipeline(ResiliencePipelines.Publish);
            await pipeline.ExecuteAsync(ct => new ValueTask(publish(ct)), cancellationToken);
            return null;
        }
        catch (Exception ex)
        {
            logger.LogCritical(ex, "Failed to publish {EventName} for ticket {TicketId} after DB commit; event is lost.", eventName, ticketId);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "The ticket was saved, but a downstream update could not be sent. Please refresh shortly." });
        }
    }

    [HttpPost]
    [Authorize(Roles = Roles.Customer)]
    public async Task<ActionResult<TicketResponse>> Create(CreateTicketRequest request, CancellationToken cancellationToken)
    {
        var ticket = new Ticket
        {
            Title = request.Title,
            Description = request.Description,
            Priority = request.Priority,
            Category = request.Category,
            CustomerId = User.GetUserId(),
        };

        db.Tickets.Add(ticket);
        await db.SaveChangesAsync(cancellationToken);

        var publishFailure = await TryPublishAsync(
            ct => publishEndpoint.Publish(new TicketCreated(
                ticket.Id,
                ticket.CustomerId,
                ticket.Title,
                ticket.Status.ToString(),
                ticket.CreatedAtUtc),
                context => context.CorrelationId = HttpContext.GetCorrelationId(), ct),
            ticket.Id, nameof(TicketCreated), cancellationToken);
        if (publishFailure is not null)
        {
            return publishFailure;
        }

        return CreatedAtAction(nameof(GetById), new { id = ticket.Id }, TicketResponse.FromEntity(ticket));
    }

    [HttpGet("mine")]
    [Authorize(Roles = Roles.Customer)]
    public async Task<ActionResult<IEnumerable<TicketResponse>>> GetMine()
    {
        var customerId = User.GetUserId();
        var tickets = await db.Tickets
            .Where(t => t.CustomerId == customerId)
            .OrderByDescending(t => t.CreatedAtUtc)
            .ToListAsync();

        return Ok(tickets.Select(TicketResponse.FromEntity));
    }

    [HttpGet]
    [Authorize(Roles = Roles.StaffRoles)]
    public async Task<ActionResult<IEnumerable<TicketResponse>>> GetAll(
        [FromQuery] TicketStatus? status,
        [FromQuery] TicketPriority? priority,
        [FromQuery] TicketCategory? category = null,
        [FromQuery] string? customerId = null,
        [FromQuery] DateTime? fromUtc = null,
        [FromQuery] DateTime? toUtc = null)
    {
        var query = db.Tickets.AsQueryable();
        if (status is not null)
        {
            query = query.Where(t => t.Status == status);
        }

        if (priority is not null)
        {
            query = query.Where(t => t.Priority == priority);
        }

        if (category is not null)
        {
            query = query.Where(t => t.Category == category);
        }

        if (!string.IsNullOrWhiteSpace(customerId))
        {
            query = query.Where(t => t.CustomerId == customerId);
        }

        if (fromUtc is not null)
        {
            query = query.Where(t => t.CreatedAtUtc >= fromUtc);
        }

        if (toUtc is not null)
        {
            query = query.Where(t => t.CreatedAtUtc <= toUtc);
        }

        var tickets = await query.OrderByDescending(t => t.CreatedAtUtc).ToListAsync();
        return Ok(tickets.Select(TicketResponse.FromEntity));
    }

    [HttpGet("agents")]
    [Authorize(Roles = Roles.StaffRoles)]
    public async Task<ActionResult<IEnumerable<StaffSummaryDto>>> GetAgents()
    {
        // Staff-only, name-only lookup for the assignment picker — UsersController's full
        // roster (email, active status, role management) stays Admin-only.
        var agents = await userManager.GetUsersInRoleAsync(Roles.SupportAgent);
        var admins = await userManager.GetUsersInRoleAsync(Roles.Admin);

        var staff = agents.Concat(admins)
            .DistinctBy(u => u.Id)
            .OrderBy(u => u.FullName)
            .Select(u => new StaffSummaryDto(u.Id, u.FullName));

        return Ok(staff);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<TicketResponse>> GetById(Guid id)
    {
        var ticket = await db.Tickets.FirstOrDefaultAsync(t => t.Id == id);
        if (ticket is null)
        {
            return NotFound();
        }

        var isOwner = ticket.CustomerId == User.GetUserId();
        if (!isOwner && !User.IsStaff())
        {
            return Forbid();
        }

        return Ok(TicketResponse.FromEntity(ticket));
    }

    [HttpPatch("{id:guid}/status")]
    [Authorize(Roles = Roles.StaffRoles)]
    public async Task<ActionResult<TicketResponse>> UpdateStatus(Guid id, UpdateTicketStatusRequest request, CancellationToken cancellationToken)
    {
        var ticket = await db.Tickets.FirstOrDefaultAsync(t => t.Id == id);
        if (ticket is null)
        {
            return NotFound();
        }

        var previousStatus = ticket.Status;
        if (previousStatus == request.Status)
        {
            return Ok(TicketResponse.FromEntity(ticket));
        }

        ticket.Status = request.Status;
        ticket.UpdatedAtUtc = DateTime.UtcNow;
        if (request.Status == TicketStatus.Closed)
        {
            ticket.ClosedAtUtc = DateTime.UtcNow;
        }

        await db.SaveChangesAsync(cancellationToken);

        var publishFailure = await TryPublishAsync(
            ct => publishEndpoint.Publish(new TicketStatusChanged(
                ticket.Id,
                ticket.CustomerId,
                previousStatus.ToString(),
                ticket.Status.ToString(),
                ticket.UpdatedAtUtc),
                context => context.CorrelationId = HttpContext.GetCorrelationId(), ct),
            ticket.Id, nameof(TicketStatusChanged), cancellationToken);
        if (publishFailure is not null)
        {
            return publishFailure;
        }

        return Ok(TicketResponse.FromEntity(ticket));
    }

    [HttpPatch("{id:guid}/assign")]
    [Authorize(Roles = Roles.StaffRoles)]
    public async Task<ActionResult<TicketResponse>> Assign(Guid id, [FromBody] AssignTicketRequest? request = null)
    {
        var ticket = await db.Tickets.FirstOrDefaultAsync(t => t.Id == id);
        if (ticket is null)
        {
            return NotFound();
        }

        // No body at all preserves the original "assign to me" shortcut; a body with
        // AgentId set targets another agent, and AgentId: null unassigns the ticket.
        if (request is null)
        {
            ticket.AssignedAgentId = User.GetUserId();
        }
        else if (request.AgentId is null)
        {
            ticket.AssignedAgentId = null;
        }
        else
        {
            var agent = await userManager.FindByIdAsync(request.AgentId);
            if (agent is null || !await userManager.IsInRoleAsync(agent, Roles.SupportAgent) && !await userManager.IsInRoleAsync(agent, Roles.Admin))
            {
                return BadRequest(new[] { "Ticket can only be assigned to a support agent or admin." });
            }

            ticket.AssignedAgentId = agent.Id;
        }

        ticket.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return Ok(TicketResponse.FromEntity(ticket));
    }
}
