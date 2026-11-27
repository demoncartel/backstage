using System.Collections.Immutable;
using ${{ values.pascalName }}.Features.Orders.Domain;
using ${{ values.pascalName }}.Shared;

namespace ${{ values.pascalName }}.Tests.Unit;

// The domain is pure, so these tests need no mocks, no clock and no host: inputs in, result out.
public sealed class OrderTests
{
    private static readonly OrderId Id = new(Guid.Parse("0195f2a8-0000-7000-8000-000000000001"));
    private static readonly DateTimeOffset PlacedAt = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Place_with_valid_lines_returns_the_order_with_its_total()
    {
        ImmutableArray<OrderLine> lines = [new("ABC-1", 2, 10m), new("XYZ-9", 1, 5.5m)];

        var result = Order.Place(Id, "customer-1", lines, PlacedAt);

        var order = Assert.IsType<Result<Order>.Success>(result).Value;
        Assert.Equal(25.5m, order.Total);
        Assert.Equal(PlacedAt, order.PlacedAt);
    }

    [Fact]
    public void Place_with_a_repeated_sku_is_a_rule_violation()
    {
        ImmutableArray<OrderLine> lines = [new("ABC-1", 1, 1m), new("abc-1", 1, 1m)];

        var result = Order.Place(Id, "customer-1", lines, PlacedAt);

        var error = Assert.IsType<RuleViolationError>(Assert.IsType<Result<Order>.Failure>(result).Error);
        Assert.Equal("order_duplicate_sku", error.Code);
    }

    [Fact]
    public void Place_over_the_limit_is_a_rule_violation()
    {
        ImmutableArray<OrderLine> lines = [new("BIG-1", 2, Order.MaxOrderTotal)];

        var result = Order.Place(Id, "customer-1", lines, PlacedAt);

        var failure = Assert.IsType<Result<Order>.Failure>(result);
        Assert.Equal("order_limit_exceeded", failure.Error.Code);
    }

    [Fact]
    public void Place_is_deterministic()
    {
        ImmutableArray<OrderLine> lines = [new("ABC-1", 3, 2m)];

        var first = Order.Place(Id, "customer-1", lines, PlacedAt);
        var second = Order.Place(Id, "customer-1", lines, PlacedAt);

        Assert.Equal(first, second);
    }
}
