using System.Diagnostics;
using System.Reflection;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using OpenTelemetry;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

namespace ${{ values.pascalName }}.ServiceDefaults;

/// <summary>
/// Opinionated defaults every service gets by calling <see cref="AddServiceDefaults{TBuilder}"/>
/// and <see cref="UseServiceDefaults"/>: OpenTelemetry traces, metrics and logs, health checks,
/// and ProblemDetails for every error response.
/// </summary>
public static class ServiceDefaultsExtensions
{
    public const string HealthPath = "/health";
    public const string AlivePath = "/alive";

    public static TBuilder AddServiceDefaults<TBuilder>(this TBuilder builder)
        where TBuilder : IHostApplicationBuilder
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ConfigureOpenTelemetry();

        builder.Services.AddHealthChecks()
            .AddCheck("self", () => HealthCheckResult.Healthy(), ["live"]);

        builder.Services.AddProblemDetails(options => options.CustomizeProblemDetails = context =>
        {
            context.ProblemDetails.Instance ??= $"{context.HttpContext.Request.Method} {context.HttpContext.Request.Path}";
            context.ProblemDetails.Extensions.TryAdd("traceId", Activity.Current?.TraceId.ToString() ?? context.HttpContext.TraceIdentifier);
        });

        return builder;
    }

    public static TBuilder ConfigureOpenTelemetry<TBuilder>(this TBuilder builder)
        where TBuilder : IHostApplicationBuilder
    {
        ArgumentNullException.ThrowIfNull(builder);
        var serviceName = builder.Configuration["Service:Name"] ?? builder.Environment.ApplicationName;
        var serviceVersion = Assembly.GetEntryAssembly()?
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "0.0.0";

        // Your own ActivitySources and Meters are picked up by naming them "<AppName>.<Feature>".
        var ownTelemetry = $"{builder.Environment.ApplicationName}.*";

        builder.Logging.AddOpenTelemetry(logging =>
        {
            logging.IncludeFormattedMessage = true;
            logging.IncludeScopes = true;
        });

        builder.Services.AddOpenTelemetry()
            .ConfigureResource(resource => resource
                .AddService(serviceName, serviceVersion: serviceVersion)
                .AddAttributes([new("deployment.environment.name", builder.Environment.EnvironmentName)]))
            .WithMetrics(metrics => metrics
                .AddMeter("Microsoft.AspNetCore.Hosting", "Microsoft.AspNetCore.Server.Kestrel", "System.Net.Http")
                .AddRuntimeInstrumentation()
                .AddMeter(ownTelemetry))
            .WithTracing(tracing => tracing
                .AddSource(ownTelemetry)
                .AddAspNetCoreInstrumentation(options =>
                    options.Filter = context => !IsProbe(context.Request.Path))
                .AddHttpClientInstrumentation());

        // Export over OTLP when a collector is configured (OTEL_EXPORTER_OTLP_ENDPOINT); otherwise
        // telemetry stays in-process and logs still go to the console.
        if (!string.IsNullOrWhiteSpace(builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]))
        {
            builder.Services.AddOpenTelemetry().UseOtlpExporter();
        }

        return builder;
    }

    public static WebApplication UseServiceDefaults(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);

        // Unhandled exceptions and bare status codes become ProblemDetails, never HTML or stack traces.
        app.UseExceptionHandler();
        app.UseStatusCodePages();
        return app;
    }

    public static IEndpointRouteBuilder MapDefaultEndpoints(this IEndpointRouteBuilder app)
    {
        // Readiness: every registered check. Liveness: only checks tagged "live".
        app.MapHealthChecks(HealthPath, new HealthCheckOptions { ResponseWriter = WriteHealthAsync });
        app.MapHealthChecks(AlivePath, new HealthCheckOptions
        {
            Predicate = check => check.Tags.Contains("live"),
            ResponseWriter = WriteHealthAsync,
        });
        return app;
    }

    private static bool IsProbe(PathString path) =>
        path.StartsWithSegments(HealthPath, StringComparison.OrdinalIgnoreCase)
        || path.StartsWithSegments(AlivePath, StringComparison.OrdinalIgnoreCase);

    private static Task WriteHealthAsync(HttpContext context, HealthReport report)
    {
        context.Response.ContentType = "application/json";
        var body = new
        {
            status = report.Status.ToString(),
            durationMs = report.TotalDuration.TotalMilliseconds,
            checks = report.Entries.ToDictionary(
                entry => entry.Key,
                entry => new { status = entry.Value.Status.ToString(), description = entry.Value.Description }),
        };
        return context.Response.WriteAsync(JsonSerializer.Serialize(body));
    }
}
