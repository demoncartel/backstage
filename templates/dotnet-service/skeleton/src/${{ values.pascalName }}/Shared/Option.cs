namespace ${{ values.pascalName }}.Shared;

/// <summary>
/// A value that may be absent, used instead of null. Turn it into a <see cref="Result{T}"/>
/// with <see cref="ToResult"/> when absence is an error for the caller.
/// </summary>
public abstract record Option<T>
{
    private Option()
    {
    }

    public sealed record Some(T Value) : Option<T>;

    public sealed record None : Option<T>;

    public Option<TOut> Map<TOut>(Func<T, TOut> map) => this switch
    {
        Some s => new Option<TOut>.Some(map(s.Value)),
        _ => new Option<TOut>.None(),
    };

    public TOut Match<TOut>(Func<T, TOut> onSome, Func<TOut> onNone) => this switch
    {
        Some s => onSome(s.Value),
        _ => onNone(),
    };

    public Result<T> ToResult(Func<Error> whenNone) => this switch
    {
        Some s => new Result<T>.Success(s.Value),
        _ => new Result<T>.Failure(whenNone()),
    };
}

public static class Option
{
    public static Option<T> Some<T>(T value) => new Option<T>.Some(value);

    public static Option<T> None<T>() => new Option<T>.None();
}
