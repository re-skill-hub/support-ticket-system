using Contracts.Auth;
using Contracts.Constants;
using Contracts.Events;
using Contracts.Observability;
using MassTransit;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TicketService.Data;
using TicketService.Dtos;
using TicketService.Entities;

namespace TicketService.Controllers;

[ApiController]
[Route("api/tickets")]
[Authorize]
public class TicketsController(AppDbContext db, IPublishEndpoint publishEndpoint) : ControllerBase
{
    [HttpPost]
    [Authorize(Roles = Roles.Customer)]
    public async Task<ActionResult<TicketResponse>> Create(CreateTicketRequest request)
    {
        var ticket = new Ticket
        {
            Title = request.Title,
            Description = request.Description,
            CustomerId = User.GetUserId(),
        };

        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        await publishEndpoint.Publish(new TicketCreated(
            ticket.Id,
            ticket.CustomerId,
            ticket.Title,
            ticket.Status.ToString(),
            ticket.CreatedAtUtc),
            context => context.CorrelationId = HttpContext.GetCorrelationId());

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
    [Authorize(Roles = Roles.SupportAgent)]
    public async Task<ActionResult<IEnumerable<TicketResponse>>> GetAll([FromQuery] TicketStatus? status)
    {
        var query = db.Tickets.AsQueryable();
        if (status is not null)
        {
            query = query.Where(t => t.Status == status);
        }

        var tickets = await query.OrderByDescending(t => t.CreatedAtUtc).ToListAsync();
        return Ok(tickets.Select(TicketResponse.FromEntity));
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
        var isAgent = User.IsInRole(Roles.SupportAgent);
        if (!isOwner && !isAgent)
        {
            return Forbid();
        }

        return Ok(TicketResponse.FromEntity(ticket));
    }

    [HttpPatch("{id:guid}/status")]
    [Authorize(Roles = Roles.SupportAgent)]
    public async Task<ActionResult<TicketResponse>> UpdateStatus(Guid id, UpdateTicketStatusRequest request)
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

        await db.SaveChangesAsync();

        await publishEndpoint.Publish(new TicketStatusChanged(
            ticket.Id,
            ticket.CustomerId,
            previousStatus.ToString(),
            ticket.Status.ToString(),
            ticket.UpdatedAtUtc),
            context => context.CorrelationId = HttpContext.GetCorrelationId());

        return Ok(TicketResponse.FromEntity(ticket));
    }

    [HttpPatch("{id:guid}/assign")]
    [Authorize(Roles = Roles.SupportAgent)]
    public async Task<ActionResult<TicketResponse>> AssignToSelf(Guid id)
    {
        var ticket = await db.Tickets.FirstOrDefaultAsync(t => t.Id == id);
        if (ticket is null)
        {
            return NotFound();
        }

        ticket.AssignedAgentId = User.GetUserId();
        ticket.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return Ok(TicketResponse.FromEntity(ticket));
    }
}
