using System.Text.Json.Serialization;
using ${{ values.pascalName }}.Features.Orders;
using ${{ values.pascalName }}.ServiceDefaults;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
// OpenAPI 3.1 is what Backstage's API docs and most tooling render today.
builder.Services.AddOpenApi(options =>
{
    options.OpenApiVersion = Microsoft.OpenApi.OpenApiSpecVersion.OpenApi3_1;
    options.AddDocumentTransformer((document, _, _) =>
    {
        document.Info.Title = builder.Configuration["Service:Name"] ?? builder.Environment.ApplicationName;
        return Task.CompletedTask;
    });
});

// Numbers are numbers: don't accept "12" for 12, so the contract (and the OpenAPI schema) stays strict.
builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.NumberHandling = JsonNumberHandling.Strict);
builder.Services.AddSingleton(TimeProvider.System);

// One line per feature. Each feature registers and maps its own slices.
builder.Services.AddOrders();

var app = builder.Build();

app.UseServiceDefaults();
app.MapOpenApi();
app.MapDefaultEndpoints();
app.MapOrders();

await app.RunAsync();
