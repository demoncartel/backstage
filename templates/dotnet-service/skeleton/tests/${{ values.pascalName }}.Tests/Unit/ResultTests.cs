using ${{ values.pascalName }}.Shared;

namespace ${{ values.pascalName }}.Tests.Unit;

public sealed class ResultTests
{
    private static readonly Error Boom = new RuleViolationError("boom", "Boom.");

    [Fact]
    public void Bind_and_Map_run_on_success()
    {
        var result = Result.Ok(2).Bind(x => Result.Ok(x * 10)).Map(x => x + 1);

        Assert.Equal(21, result.Match(x => x, _ => -1));
    }

    [Fact]
    public void The_first_failure_short_circuits_the_rest()
    {
        var calls = 0;

        var result = Result.Fail<int>(Boom)
            .Bind(x => { calls++; return Result.Ok(x); })
            .Map(x => { calls++; return x; });

        Assert.Equal(0, calls);
        Assert.Equal("boom", result.Match(_ => "ok", e => e.Code));
    }

    [Fact]
    public void Option_None_becomes_the_given_error()
    {
        var result = Option.None<int>().ToResult(() => Boom);

        Assert.Equal(Boom, Assert.IsType<Result<int>.Failure>(result).Error);
    }
}
