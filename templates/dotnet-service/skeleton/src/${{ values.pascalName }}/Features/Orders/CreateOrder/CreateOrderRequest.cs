namespace ${{ values.pascalName }}.Features.Orders.CreateOrder;

/// <summary>What a client sends. Nullable on purpose: this is untrusted input until validated.</summary>
/// <param name="CustomerId">The customer placing the order.</param>
/// <param name="Lines">One entry per product.</param>
public sealed record CreateOrderRequest(string? CustomerId, IReadOnlyList<CreateOrderLine>? Lines);

/// <summary>A product and how many of it.</summary>
/// <param name="Sku">Product code, letters, digits and hyphens.</param>
/// <param name="Quantity">Between 1 and 1000.</param>
/// <param name="UnitPrice">Price of one item; greater than zero.</param>
public sealed record CreateOrderLine(string? Sku, int Quantity, decimal UnitPrice);
