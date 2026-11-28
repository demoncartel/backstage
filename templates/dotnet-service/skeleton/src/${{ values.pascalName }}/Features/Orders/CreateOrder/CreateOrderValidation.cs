using System.Collections.Immutable;
using System.Text.RegularExpressions;
using ${{ values.pascalName }}.Features.Orders.Domain;
using ${{ values.pascalName }}.Shared;

namespace ${{ values.pascalName }}.Features.Orders.CreateOrder;

/// <summary>Input that has passed validation: non-null, well formed, ready for the domain.</summary>
public sealed record ValidCreateOrder(string CustomerId, ImmutableArray<OrderLine> Lines);

/// <summary>
/// Pure shape checks on the request. Collects every problem rather than stopping at the first,
/// so a client can fix all of them in one go. Business rules live in the domain, not here.
/// </summary>
public static partial class CreateOrderValidation
{
    public const int MaxLines = 50;
    public const int MaxQuantity = 1000;

    public static Result<ValidCreateOrder> Validate(CreateOrderRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        var failures = ImmutableDictionary.CreateBuilder<string, string[]>();

        if (string.IsNullOrWhiteSpace(request.CustomerId))
        {
            failures.Add("customerId", ["Customer id is required."]);
        }

        var lines = request.Lines ?? [];
        if (lines.Count == 0)
        {
            failures.Add("lines", ["An order needs at least one line."]);
        }
        else if (lines.Count > MaxLines)
        {
            failures.Add("lines", [$"An order can have at most {MaxLines} lines."]);
        }

        for (var i = 0; i < lines.Count; i++)
        {
            var problems = LineProblems(lines[i]);
            if (problems.Length > 0)
            {
                failures.Add($"lines[{i}]", problems);
            }
        }

        if (failures.Count > 0)
        {
            return new ValidationError(failures.ToImmutable());
        }

        return new ValidCreateOrder(
            request.CustomerId!.Trim(),
            [.. lines.Select(line => new OrderLine(line.Sku!.Trim().ToUpperInvariant(), line.Quantity, line.UnitPrice))]);
    }

    private static string[] LineProblems(CreateOrderLine line) =>
    [
        .. string.IsNullOrWhiteSpace(line.Sku) || !SkuPattern().IsMatch(line.Sku)
            ? ["SKU must be 1-32 letters, digits or hyphens."]
            : Array.Empty<string>(),
        .. line.Quantity is < 1 or > MaxQuantity
            ? [$"Quantity must be between 1 and {MaxQuantity}."]
            : Array.Empty<string>(),
        .. line.UnitPrice <= 0
            ? ["Unit price must be greater than zero."]
            : Array.Empty<string>(),
    ];

    [GeneratedRegex("^[A-Za-z0-9-]{1,32}$")]
    private static partial Regex SkuPattern();
}
