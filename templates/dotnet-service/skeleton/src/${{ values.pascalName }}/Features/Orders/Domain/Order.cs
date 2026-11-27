using System.Collections.Immutable;
using ${{ values.pascalName }}.Shared;

namespace ${{ values.pascalName }}.Features.Orders.Domain;

/// <summary>
/// The Orders aggregate. Pure: no I/O, no clock, no logging. Everything it needs (the id, the
/// time) is passed in, so the same inputs always give the same result and tests need no mocks.
/// </summary>
public sealed record Order(OrderId Id, string CustomerId, ImmutableArray<OrderLine> Lines, DateTimeOffset PlacedAt)
{
    /// <summary>Largest order the business accepts without a manual review.</summary>
    public const decimal MaxOrderTotal = 10_000m;

    public decimal Total => Lines.Sum(line => line.LineTotal);

    /// <summary>Apply the business rules for placing an order.</summary>
    public static Result<Order> Place(
        OrderId id,
        string customerId,
        ImmutableArray<OrderLine> lines,
        DateTimeOffset placedAt) =>
        EnsureUniqueSkus(lines)
            .Bind(EnsureWithinLimit)
            .Map(valid => new Order(id, customerId, valid, placedAt));

    private static Result<ImmutableArray<OrderLine>> EnsureUniqueSkus(ImmutableArray<OrderLine> lines)
    {
        var duplicate = lines
            .GroupBy(line => line.Sku, StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault(group => group.Count() > 1);

        return duplicate is null ? lines : OrderErrors.DuplicateSku(duplicate.Key);
    }

    private static Result<ImmutableArray<OrderLine>> EnsureWithinLimit(ImmutableArray<OrderLine> lines)
    {
        var total = lines.Sum(line => line.LineTotal);
        return total <= MaxOrderTotal ? lines : OrderErrors.LimitExceeded(total, MaxOrderTotal);
    }
}
