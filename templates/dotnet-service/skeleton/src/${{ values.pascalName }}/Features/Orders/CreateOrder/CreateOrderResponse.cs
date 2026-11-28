using ${{ values.pascalName }}.Features.Orders.Domain;

namespace ${{ values.pascalName }}.Features.Orders.CreateOrder;

/// <summary>The order as accepted. Each slice owns its own contract, so slices change independently.</summary>
public sealed record CreateOrderResponse(Guid Id, string CustomerId, decimal Total, int LineCount, DateTimeOffset PlacedAt)
{
    public static CreateOrderResponse From(Order order)
    {
        ArgumentNullException.ThrowIfNull(order);
        return new(order.Id.Value, order.CustomerId, order.Total, order.Lines.Length, order.PlacedAt);
    }
}
