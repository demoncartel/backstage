namespace ${{ values.pascalName }}.Features.Orders.Domain;

/// <summary>One product on an order. Immutable; the total is derived, never stored.</summary>
public sealed record OrderLine(string Sku, int Quantity, decimal UnitPrice)
{
    public decimal LineTotal => Quantity * UnitPrice;
}
