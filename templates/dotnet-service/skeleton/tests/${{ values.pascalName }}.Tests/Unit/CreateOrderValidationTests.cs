using ${{ values.pascalName }}.Features.Orders.CreateOrder;
using ${{ values.pascalName }}.Shared;

namespace ${{ values.pascalName }}.Tests.Unit;

public sealed class CreateOrderValidationTests
{
    [Fact]
    public void Valid_request_is_normalised()
    {
        var request = new CreateOrderRequest(" customer-1 ", [new CreateOrderLine("abc-1", 2, 3m)]);

        var result = CreateOrderValidation.Validate(request);

        var valid = Assert.IsType<Result<ValidCreateOrder>.Success>(result).Value;
        Assert.Equal("customer-1", valid.CustomerId);
        Assert.Equal("ABC-1", Assert.Single(valid.Lines).Sku);
    }

    [Fact]
    public void Every_problem_is_reported_at_once()
    {
        var request = new CreateOrderRequest(null, [new CreateOrderLine("not a sku!", 0, -1m)]);

        var result = CreateOrderValidation.Validate(request);

        var error = Assert.IsType<ValidationError>(Assert.IsType<Result<ValidCreateOrder>.Failure>(result).Error);
        Assert.Contains("customerId", error.Failures.Keys);
        Assert.Equal(3, error.Failures["lines[0]"].Length);
    }

    [Fact]
    public void Missing_lines_are_rejected()
    {
        var result = CreateOrderValidation.Validate(new CreateOrderRequest("customer-1", null));

        var error = Assert.IsType<ValidationError>(Assert.IsType<Result<ValidCreateOrder>.Failure>(result).Error);
        Assert.Contains("lines", error.Failures.Keys);
    }
}
