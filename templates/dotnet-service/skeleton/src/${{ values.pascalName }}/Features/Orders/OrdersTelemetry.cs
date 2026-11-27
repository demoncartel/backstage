using System.Diagnostics;
using System.Diagnostics.Metrics;
using ${{ values.pascalName }}.Features.Orders.Domain;

namespace ${{ values.pascalName }}.Features.Orders;

/// <summary>
/// Business metrics and spans for Orders. Named <c>${{ values.pascalName }}.Orders</c>, which
/// ServiceDefaults picks up through its <c>${{ values.pascalName }}.*</c> wildcard.
/// </summary>
public sealed class OrdersTelemetry
{
    public const string Name = "${{ values.pascalName }}.Orders";

    public static readonly ActivitySource Source = new(Name);

    private readonly Counter<long> _placed;
    private readonly Counter<long> _rejected;
    private readonly Histogram<double> _value;

    public OrdersTelemetry(IMeterFactory meterFactory)
    {
        ArgumentNullException.ThrowIfNull(meterFactory);
        var meter = meterFactory.Create(Name);
        _placed = meter.CreateCounter<long>("orders.placed", unit: "{order}", description: "Orders accepted.");
        _rejected = meter.CreateCounter<long>("orders.rejected", unit: "{order}", description: "Orders refused, by error code.");
        _value = meter.CreateHistogram<double>("orders.value", unit: "{currency}", description: "Order totals.");
    }

    public void Placed(Order order)
    {
        ArgumentNullException.ThrowIfNull(order);
        _placed.Add(1);
        _value.Record((double)order.Total);
    }

    public void Rejected(string errorCode) =>
        _rejected.Add(1, new KeyValuePair<string, object?>("error.code", errorCode));
}
