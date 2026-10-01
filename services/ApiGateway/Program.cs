using Contracts.ExceptionHandling;
using Contracts.Observability;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

builder.Host.AddServiceObservability("ApiGateway");
builder.Services.AddSharedTracing("ApiGateway");

builder.Services.AddSharedExceptionHandling();

builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));
builder.Services.AddRequestTimeouts();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AngularClient", policy =>
        policy.WithOrigins(builder.Configuration["Cors:AllowedOrigin"] ?? "http://localhost:4200")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials());
});

var app = builder.Build();

app.UseExceptionHandler();

app.UseSerilogRequestLogging();
app.UseCorrelationId();
app.UseRouting();
app.UseRequestTimeouts();

app.UseCors("AngularClient");

// Unlike the other 3 services, the gateway has no DB/broker dependency of its own to check —
// YARP's active health checks (configured per cluster in appsettings.json) already track each
// downstream service's health independently and pull a degraded one out of rotation.
app.MapGet("/health/live", () => Results.Ok());
app.MapGet("/health/ready", () => Results.Ok());

app.MapReverseProxy();

app.Run();
