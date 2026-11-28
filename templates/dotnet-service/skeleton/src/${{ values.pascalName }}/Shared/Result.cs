using System.Diagnostics;

namespace ${{ values.pascalName }}.Shared;

/// <summary>
/// Either a value (<see cref="Success"/>) or an <see cref="Error"/> (<see cref="Failure"/>).
/// Closed hierarchy: the private constructor means these two cases are the only ones.
/// Compose with <see cref="Bind{TOut}"/> and <see cref="Map{TOut}"/>; leave with <see cref="Match{TOut}"/>.
/// </summary>
public abstract record Result<T>
{
    private Result()
    {
    }

    public sealed record Success(T Value) : Result<T>;

    public sealed record Failure(Error Error) : Result<T>;

    public static implicit operator Result<T>(T value) => new Success(value);

    public static implicit operator Result<T>(Error error) => new Failure(error);

    public bool IsSuccess => this is Success;

    /// <summary>Chain a step that can itself fail. Short-circuits on the first failure.</summary>
    public Result<TOut> Bind<TOut>(Func<T, Result<TOut>> next) => this switch
    {
        Success s => next(s.Value),
        Failure f => new Result<TOut>.Failure(f.Error),
        _ => throw new UnreachableException(),
    };

    /// <summary>Transform the value of a success; failures pass through untouched.</summary>
    public Result<TOut> Map<TOut>(Func<T, TOut> map) => this switch
    {
        Success s => new Result<TOut>.Success(map(s.Value)),
        Failure f => new Result<TOut>.Failure(f.Error),
        _ => throw new UnreachableException(),
    };

    /// <summary>Leave the railway: handle both cases and produce one value.</summary>
    public TOut Match<TOut>(Func<T, TOut> onSuccess, Func<Error, TOut> onFailure) => this switch
    {
        Success s => onSuccess(s.Value),
        Failure f => onFailure(f.Error),
        _ => throw new UnreachableException(),
    };
}

/// <summary>Helpers that keep call sites readable.</summary>
public static class Result
{
    public static Result<T> Ok<T>(T value) => new Result<T>.Success(value);

    public static Result<T> Fail<T>(Error error) => new Result<T>.Failure(error);

    /// <summary>Async Bind for steps with side effects (I/O at the edges).</summary>
    public static async Task<Result<TOut>> BindAsync<T, TOut>(
        this Result<T> result,
        Func<T, Task<Result<TOut>>> next) => result switch
        {
            Result<T>.Success s => await next(s.Value),
            Result<T>.Failure f => new Result<TOut>.Failure(f.Error),
            _ => throw new UnreachableException(),
        };

    /// <summary>Async Map for steps with side effects that cannot fail with a business error.</summary>
    public static async Task<Result<TOut>> MapAsync<T, TOut>(
        this Result<T> result,
        Func<T, Task<TOut>> map) => result switch
        {
            Result<T>.Success s => await map(s.Value),
            Result<T>.Failure f => new Result<TOut>.Failure(f.Error),
            _ => throw new UnreachableException(),
        };

    public static async Task<TOut> MatchAsync<T, TOut>(
        this Task<Result<T>> result,
        Func<T, TOut> onSuccess,
        Func<Error, TOut> onFailure) => (await result).Match(onSuccess, onFailure);
}
