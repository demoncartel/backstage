using ${{ values.pascalName }}.Shared.Http;

namespace ${{ values.pascalName }}.Features.Orders.CreateOrder;

/// <summary>HTTP edge of the slice: binds the request, runs the handler, maps the result.</summary>
public static class CreateOrderEndpoint
{
    public static RouteHandlerBuilder MapCreateOrder(this IEndpointRouteBuilder orders) =>
        orders.MapPost("/", HandleAsync)
            .WithName("CreateOrder")
            .WithSummary("Place an order")
            .WithDescription("Validates the lines, applies the order rules and stores the order.")
            .Produces<CreateOrderResponse>(StatusCodes.Status201Created)
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status422UnprocessableEntity);

    private static async Task<IResult> HandleAsync(
        CreateOrderRequest request,
        CreateOrderHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(request, cancellationToken);
        return result.Match<IResult>(
            created => TypedResults.CreatedAtRoute(created, OrderRoutes.GetOrder, new { id = created.Id }),
            error => error.ToProblem());
    }
}
