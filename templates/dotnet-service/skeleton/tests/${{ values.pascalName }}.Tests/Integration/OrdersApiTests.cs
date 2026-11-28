using System.Net;
using System.Text.Json;
using ${{ values.pascalName }}.Features.Orders.CreateOrder;
using ${{ values.pascalName }}.Features.Orders.GetOrder;

namespace ${{ values.pascalName }}.Tests.Integration;

// The real app, in memory, over HTTP: routing, binding, ProblemDetails mapping and DI included.
public sealed class OrdersApiTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Created_order_can_be_read_back_from_its_location()
    {
        var request = new CreateOrderRequest("customer-1", [new CreateOrderLine("ABC-1", 2, 9.99m)]);

        using var created = await _client.PostAsJsonAsync("/orders", request, Ct);

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.NotNull(created.Headers.Location);

        var order = await _client.GetFromJsonAsync<GetOrderResponse>(created.Headers.Location, Ct);
        Assert.NotNull(order);
        Assert.Equal(19.98m, order.Total);
        Assert.Equal("ABC-1", Assert.Single(order.Lines).Sku);
    }

    [Fact]
    public async Task Invalid_request_is_a_400_validation_problem()
    {
        using var response = await _client.PostAsJsonAsync("/orders", new CreateOrderRequest(null, []), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await ReadJsonAsync(response);
        Assert.True(problem.GetProperty("errors").TryGetProperty("customerId", out _));
    }

    [Fact]
    public async Task Business_rule_violation_is_a_422_with_its_code()
    {
        var request = new CreateOrderRequest("customer-1", [new CreateOrderLine("ABC-1", 1, 1m), new CreateOrderLine("ABC-1", 1, 1m)]);

        using var response = await _client.PostAsJsonAsync("/orders", request, Ct);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var problem = await ReadJsonAsync(response);
        Assert.Equal("order_duplicate_sku", problem.GetProperty("code").GetString());
        Assert.True(problem.TryGetProperty("traceId", out _));
    }

    [Fact]
    public async Task Unknown_order_is_a_404_problem()
    {
        using var response = await _client.GetAsync($"/orders/{Guid.NewGuid()}", Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var problem = await ReadJsonAsync(response);
        Assert.Equal("order_not_found", problem.GetProperty("code").GetString());
    }

    [Theory]
    [InlineData("/health")]
    [InlineData("/alive")]
    public async Task Health_endpoints_report_healthy(string path)
    {
        using var response = await _client.GetAsync(path, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", (await ReadJsonAsync(response)).GetProperty("status").GetString());
    }

    [Fact]
    public async Task OpenApi_document_describes_the_orders_endpoints()
    {
        var document = await _client.GetStringAsync("/openapi/v1.json", Ct);

        Assert.Contains("\"/orders\"", document, StringComparison.Ordinal);
        Assert.Contains("\"/orders/{id}\"", document, StringComparison.Ordinal);
    }

    private static async Task<JsonElement> ReadJsonAsync(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
}
