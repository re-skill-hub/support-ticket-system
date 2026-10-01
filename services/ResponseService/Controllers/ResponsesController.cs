using Contracts.Auth;
using Contracts.Constants;
using Contracts.Events;
using Contracts.Observability;
using Contracts.Resilience;
using MassTransit;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Polly.Registry;
using ResponseService.Data;
using ResponseService.Dtos;
using Response = ResponseService.Entities.Response;

namespace ResponseService.Controllers;

[ApiController]
[Route("api/responses")]
[Authorize]
public class ResponsesController(
    AppDbContext db,
    IPublishEndpoint publishEndpoint,
    ResiliencePipelineProvider<string> resiliencePipelines,
    ILogger<ResponsesController> logger) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<ResponseDto>> Create(CreateResponseRequest request, CancellationToken cancellationToken)
    {
        var ticketRef = await db.TicketRefs.FirstOrDefaultAsync(t => t.TicketId == request.TicketId);
        if (ticketRef is null)
        {
            return NotFound(new { message = "Unknown ticket." });
        }

        var userId = User.GetUserId();
        if (!User.IsStaff() && ticketRef.CustomerId != userId)
        {
            return Forbid();
        }

        var authorRole = User.IsInRole(Roles.Admin) ? Roles.Admin
            : User.IsInRole(Roles.SupportAgent) ? Roles.SupportAgent
            : Roles.Customer;

        var response = new Response
        {
            TicketId = request.TicketId,
            AuthorUserId = userId,
            AuthorRole = authorRole,
            Message = request.Message,
        };

        db.Responses.Add(response);
        await db.SaveChangesAsync(cancellationToken);

        try
        {
            var pipeline = resiliencePipelines.GetPipeline(ResiliencePipelines.Publish);
            await pipeline.ExecuteAsync(ct => new ValueTask(publishEndpoint.Publish(new ResponseAdded(
                response.Id,
                response.TicketId,
                response.AuthorUserId,
                response.AuthorRole,
                response.Message,
                response.CreatedAtUtc),
                context => context.CorrelationId = HttpContext.GetCorrelationId(), ct)), cancellationToken);
        }
        catch (Exception ex)
        {
            // The DB write above already committed, so a final publish failure is logged
            // Critical (the event is lost) and surfaced as 503 rather than an opaque 500. Known
            // residual risk, not fixed here: this isn't atomic with the DB write (no
            // transactional outbox) — see plan.
            logger.LogCritical(ex, "Failed to publish ResponseAdded for response {ResponseId} after DB commit; event is lost.", response.Id);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "The response was saved, but a downstream update could not be sent. Please refresh shortly." });
        }

        return CreatedAtAction(nameof(GetByTicket), new { ticketId = response.TicketId }, ResponseDto.FromEntity(response));
    }

    [HttpGet("ticket/{ticketId:guid}")]
    public async Task<ActionResult<IEnumerable<ResponseDto>>> GetByTicket(Guid ticketId)
    {
        var ticketRef = await db.TicketRefs.FirstOrDefaultAsync(t => t.TicketId == ticketId);
        if (ticketRef is null)
        {
            return NotFound(new { message = "Unknown ticket." });
        }

        if (!User.IsStaff() && ticketRef.CustomerId != User.GetUserId())
        {
            return Forbid();
        }

        var responses = await db.Responses
            .Where(r => r.TicketId == ticketId)
            .OrderBy(r => r.CreatedAtUtc)
            .ToListAsync();

        return Ok(responses.Select(ResponseDto.FromEntity));
    }
}
