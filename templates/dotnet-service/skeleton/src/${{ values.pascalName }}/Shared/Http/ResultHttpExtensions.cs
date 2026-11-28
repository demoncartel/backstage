using Microsoft.AspNetCore.Http.HttpResults;

namespace ${{ values.pascalName }}.Shared.Http;

/// <summary>
/// The single place where business errors become HTTP. Every slice uses this, so a given
/// <see cref="Error"/> always produces the same status code and ProblemDetails shape.
/// </summary>
public static class ResultHttpExtensions
{
    public static IResult ToProblem(this Error error) => error switch
    {
        ValidationError v => TypedResults.ValidationProblem(
            v.Failures,
            title: v.Message,
            type: TypeFor(v.Code),
            extensions: Extensions(v)),
        NotFoundError e => Problem(e, StatusCodes.Status404NotFound),
        ConflictError e => Problem(e, StatusCodes.Status409Conflict),
        RuleViolationError e => Problem(e, StatusCodes.Status422UnprocessableEntity),
        _ => Problem(error, StatusCodes.Status500InternalServerError),
    };

    private static ProblemHttpResult Problem(Error error, int status) =>
        TypedResults.Problem(
            title: error.Message,
            statusCode: status,
            type: TypeFor(error.Code),
            extensions: Extensions(error));

    private static Dictionary<string, object?> Extensions(Error error) =>
        new() { ["code"] = error.Code };

    private static string TypeFor(string code) => $"urn:problem-type:{code}";
}
