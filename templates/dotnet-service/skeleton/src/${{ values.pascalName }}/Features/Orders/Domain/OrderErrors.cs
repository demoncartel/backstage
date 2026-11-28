using ${{ values.pascalName }}.Shared;

namespace ${{ values.pascalName }}.Features.Orders.Domain;

/// <summary>Every way the Orders domain can say no, in one place.</summary>
public static class OrderErrors
{
    public static Error NotFound(OrderId id) =>
        new NotFoundError("order_not_found", $"Order {id} does not exist.");

    public static Error DuplicateSku(string sku) =>
        new RuleViolationError("order_duplicate_sku", $"SKU {sku} appears more than once; combine the quantities into one line.");

    public static Error LimitExceeded(decimal total, decimal limit) =>
        new RuleViolationError("order_limit_exceeded", $"Order total {total:0.00} is over the {limit:0.00} limit.");
}
