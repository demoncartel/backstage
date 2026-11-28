using ${{ values.pascalName }}.Features.Orders.Domain;

namespace ${{ values.pascalName }}.Features.Orders.GetOrder;

/// <summary>An order and its lines.</summary>
public sealed record GetOrderResponse(
    Guid Id,
    string CustomerId,
    IReadOnlyList<GetOrderLine> Lines,
    decimal Total,
    DateTimeOffset PlacedAt)
{
    public static GetOrderResponse From(Order order)
    {
        ArgumentNullException.ThrowIfNull(order);
        return new(
            order.Id.Value,
            order.CustomerId,
            [.. order.Lines.Select(line => new GetOrderLine(line.Sku, line.Quantity, line.UnitPrice, line.LineTotal))],
            order.Total,
            order.PlacedAt);
    }
}

/// <summary>One line of an order.</summary>
public sealed record GetOrderLine(string Sku, int Quantity, decimal UnitPrice, decimal LineTotal);
