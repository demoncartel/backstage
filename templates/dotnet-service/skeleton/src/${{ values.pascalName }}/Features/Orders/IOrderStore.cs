using ${{ values.pascalName }}.Features.Orders.Domain;
using ${{ values.pascalName }}.Shared;

namespace ${{ values.pascalName }}.Features.Orders;

/// <summary>
/// The one port the Orders slices need. Deliberately tiny: no generic repository, no unit of
/// work. Swap <see cref="InMemoryOrderStore"/> for a real database without touching the slices.
/// </summary>
public interface IOrderStore
{
    Task<Option<Order>> FindAsync(OrderId id, CancellationToken cancellationToken);

    Task SaveAsync(Order order, CancellationToken cancellationToken);
}
