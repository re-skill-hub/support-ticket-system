using Contracts.Auth;
using Contracts.Data;
using Contracts.Observability;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using ResponseService.Consumers;
using ResponseService.Data;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

builder.Host.AddServiceObservability("ResponseService");

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddSharedJwtBearer(builder.Configuration);
builder.Services.AddServiceHealthChecks(builder.Configuration);

builder.Services.AddMassTransit(x =>
{
    x.SetEndpointNameFormatter(new MassTransit.KebabCaseEndpointNameFormatter("response-service", false));

    x.AddConsumer<TicketCreatedConsumer>();
    x.AddConsumer<TicketStatusChangedConsumer>();

    x.UsingRabbitMq((context, cfg) =>
    {
        cfg.Host(builder.Configuration["RabbitMq:Host"], "/", h =>
        {
            h.Username(builder.Configuration["RabbitMq:Username"] ?? "guest");
            h.Password(builder.Configuration["RabbitMq:Password"] ?? "guest");
        });

        cfg.ConfigureEndpoints(context);
    });
});

builder.Services.AddControllers()
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddProblemDetails();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AngularClient", policy =>
        policy.WithOrigins(builder.Configuration["Cors:AllowedOrigin"] ?? "http://localhost:4200")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials());
});

var app = builder.Build();

await app.Services.MigrateWithRetryAsync<AppDbContext>();

app.UseExceptionHandler();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseSerilogRequestLogging();
app.UseCorrelationId();

app.UseCors("AngularClient");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapServiceHealthChecks();

app.Run();
