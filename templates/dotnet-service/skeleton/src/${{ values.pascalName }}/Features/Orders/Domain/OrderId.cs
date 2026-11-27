namespace ${{ values.pascalName }}.Features.Orders.Domain;

/// <summary>Strongly typed id, so an order id can never be passed where another Guid is expected.</summary>
public readonly record struct OrderId(Guid Value)
{
    public override string ToString() => Value.ToString();
}
