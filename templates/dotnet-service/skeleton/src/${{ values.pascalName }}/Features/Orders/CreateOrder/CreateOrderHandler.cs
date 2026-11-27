using ${{ values.pascalName }}.Features.Orders.Domain;
using ${{ values.pascalName }}.Shared;

namespace ${{ values.pascalName }}.Features.Orders.CreateOrder;

/// <summary>
/// The imperative shell around the pure core: reads the clock, makes the id, saves, logs and
/// counts. The decisions themselves are made by <see cref="CreateOrderValidation"/> and
/// <see cref="Order.Place"/>, which have no side effects.
/// </summary>
public sealed partial class CreateOrderHandler(
    IOrderStore store,
    TimeProvider clock,
    OrdersTelemetry telemetry,
    ILogger<CreateOrderHandler> logger)
{
    public async Task<Result<CreateOrderResponse>> HandleAsync(CreateOrderRequest request, CancellationToken cancellationToken)
    {
        using var activity = OrdersTelemetry.Source.StartActivity("CreateOrder");
        var now = clock.GetUtcNow();
        var id = new OrderId(Guid.CreateVersion7(now));

        var placed = CreateOrderValidation.Validate(request)
            .Bind(valid => Order.Place(id, valid.CustomerId, valid.Lines, now));

        var saved = await placed.MapAsync(order => SaveAsync(order, cancellationToken));

        return saved.Match(
            order =>
            {
                activity?.SetTag("order.id", order.Id.ToString());
                return Result.Ok(CreateOrderResponse.From(order));
            },
            error =>
            {
                telemetry.Rejected(error.Code);
                LogRejected(logger, error.Code);
                return Result.Fail<CreateOrderResponse>(error);
            });
    }

    private async Task<Order> SaveAsync(Order order, CancellationToken cancellationToken)
    {
        await store.SaveAsync(order, cancellationToken);
        telemetry.Placed(order);
        LogPlaced(logger, order.Id, order.Lines.Length, order.Total);
        return order;
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Order {OrderId} placed with {LineCount} lines totalling {Total}")]
    private static partial void LogPlaced(ILogger logger, OrderId orderId, int lineCount, decimal total);

    [LoggerMessage(Level = LogLevel.Information, Message = "Order rejected: {ErrorCode}")]
    private static partial void LogRejected(ILogger logger, string errorCode);
}
