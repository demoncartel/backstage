using ${{ values.pascalName }}.Features.Orders.Domain;
using ${{ values.pascalName }}.Shared;

namespace ${{ values.pascalName }}.Features.Orders.GetOrder;

/// <summary>Looks an order up. Absence is an <see cref="Option{T}"/>, turned into a not-found error here.</summary>
public sealed class GetOrderHandler(IOrderStore store)
{
    public async Task<Result<GetOrderResponse>> HandleAsync(Guid id, CancellationToken cancellationToken)
    {
        var orderId = new OrderId(id);
        var found = await store.FindAsync(orderId, cancellationToken);

        return found
            .ToResult(() => OrderErrors.NotFound(orderId))
            .Map(GetOrderResponse.From);
    }
}
