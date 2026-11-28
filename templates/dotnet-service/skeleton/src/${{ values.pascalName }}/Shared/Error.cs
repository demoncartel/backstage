using System.Collections.Immutable;

namespace ${{ values.pascalName }}.Shared;

/// <summary>
/// A business-rule failure. Errors are values: they are returned inside a <see cref="Result{T}"/>,
/// never thrown. Exceptions are reserved for bugs and infrastructure faults.
/// </summary>
public abstract record Error(string Code, string Message);

/// <summary>Input was malformed. Maps to 400 with a field-by-field breakdown.</summary>
public sealed record ValidationError(ImmutableDictionary<string, string[]> Failures)
    : Error("validation_failed", "One or more fields are invalid.")
{
    public static ValidationError For(string field, string message) =>
        new(ImmutableDictionary<string, string[]>.Empty.Add(field, [message]));
}

/// <summary>The thing asked for does not exist. Maps to 404.</summary>
public sealed record NotFoundError(string Code, string Message) : Error(Code, Message);

/// <summary>The request is valid but breaks a business rule given the current state. Maps to 409.</summary>
public sealed record ConflictError(string Code, string Message) : Error(Code, Message);

/// <summary>The request is understood but the domain refuses it. Maps to 422.</summary>
public sealed record RuleViolationError(string Code, string Message) : Error(Code, Message);
