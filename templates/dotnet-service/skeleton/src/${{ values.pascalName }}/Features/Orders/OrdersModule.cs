using ${{ values.pascalName }}.Features.Orders.CreateOrder;
using ${{ values.pascalName }}.Features.Orders.GetOrder;

namespace ${{ values.pascalName }}.Features.Orders;

/// <summary>Wires the Orders feature in. Program.cs calls these two methods and nothing else.</summary>
public static class OrdersModule
{
    public static IServiceCollection AddOrders(this IServiceCollection services)
    {
        services.AddSingleton<IOrderStore, InMemoryOrderStore>();
        services.AddSingleton<OrdersTelemetry>();
        services.AddScoped<CreateOrderHandler>();
        services.AddScoped<GetOrderHandler>();
        return services;
    }

    public static IEndpointRouteBuilder MapOrders(this IEndpointRouteBuilder app)
    {
        var orders = app.MapGroup("/orders").WithTags("Orders");
        orders.MapCreateOrder();
        orders.MapGetOrder();
        return app;
    }
}
