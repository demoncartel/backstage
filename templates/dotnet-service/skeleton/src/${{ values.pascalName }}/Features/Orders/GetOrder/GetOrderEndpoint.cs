using ${{ values.pascalName }}.Shared.Http;

namespace ${{ values.pascalName }}.Features.Orders.GetOrder;

/// <summary>HTTP edge of the slice.</summary>
public static class GetOrderEndpoint
{
    public static RouteHandlerBuilder MapGetOrder(this IEndpointRouteBuilder orders) =>
        orders.MapGet("/{id:guid}", HandleAsync)
            .WithName(OrderRoutes.GetOrder)
            .WithSummary("Get an order")
            .Produces<GetOrderResponse>()
            .ProducesProblem(StatusCodes.Status404NotFound);

    private static async Task<IResult> HandleAsync(Guid id, GetOrderHandler handler, CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(id, cancellationToken);
        return result.Match<IResult>(order => TypedResults.Ok(order), error => error.ToProblem());
    }
}
