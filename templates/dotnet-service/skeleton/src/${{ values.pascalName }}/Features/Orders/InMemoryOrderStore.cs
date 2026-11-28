using System.Collections.Concurrent;
using ${{ values.pascalName }}.Features.Orders.Domain;
using ${{ values.pascalName }}.Shared;

namespace ${{ values.pascalName }}.Features.Orders;

/// <summary>Process-local store for the example. Data is lost on restart; replace before production.</summary>
public sealed class InMemoryOrderStore : IOrderStore
{
    private readonly ConcurrentDictionary<OrderId, Order> _orders = new();

    public Task<Option<Order>> FindAsync(OrderId id, CancellationToken cancellationToken) =>
        Task.FromResult(_orders.TryGetValue(id, out var order) ? Option.Some(order) : Option.None<Order>());

    public Task SaveAsync(Order order, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(order);
        _orders[order.Id] = order;
        return Task.CompletedTask;
    }
}
