# Design decisions

Short records of the choices this service starts with. Add your own below as the service
evolves: what you decided, what else you considered, and why.

## 1. Vertical slices over layers

**Decision:** organise by feature/use case (`Features/<Feature>/<UseCase>`), with minimal APIs.
**Instead of:** Controllers/Services/Repositories layers.
**Why:** a change to one use case stays in one folder; slices can differ in complexity; no
pass-through layers. Coupling rules are enforced by architecture tests, not convention.

## 2. No mediator library

**Decision:** endpoints call a plain handler class resolved from DI.
**Instead of:** MediatR (commercial licence since v13) or a similar dispatcher.
**Why:** a direct call is easier to read, debug and navigate, needs no reflection and has no
licence question. Cross-cutting behaviour lives in ServiceDefaults and middleware.

## 3. A small hand-rolled Result and Option

**Decision:** `Shared/Result.cs`, `Shared/Option.cs` and `Shared/Error.cs` (about 150 lines),
closed record hierarchies with `Bind`, `Map`, `Match` and async variants.
**Instead of:** LanguageExt (powerful but large, with a steep learning curve for a team new to
FP), ErrorOr or FluentResults (no Option, more OO-style, extra dependency).
**Why:** zero dependencies, readable in five minutes, owned by the team, and uses C# pattern
matching directly (`result is Result<T>.Failure f`). If the team later wants more of FP,
moving to LanguageExt is a mechanical change.

## 4. Errors are values; exceptions are for bugs

**Decision:** business failures are `Error` records (`ValidationError`, `NotFoundError`,
`ConflictError`, `RuleViolationError`) returned in a `Result`. One function maps them to
ProblemDetails (400/404/409/422). Unhandled exceptions become a 500 ProblemDetails.
**Why:** the signature tells you a call can fail; every error has a stable `code` clients can
switch on; HTTP mapping is consistent across slices.

## 5. A tiny port per feature, no generic repository

**Decision:** `IOrderStore` has exactly the two operations the slices need.
**Why:** easy to fake, easy to replace (EF Core, Dapper, a document DB) without touching slices.
The in-memory implementation is for the example only.

## 6. Observability by default

**Decision:** OpenTelemetry traces, metrics and logs configured once in ServiceDefaults;
OTLP export switched on by `OTEL_EXPORTER_OTLP_ENDPOINT`; JSON console logs outside
Development; `LoggerMessage` source-generated logs; business metrics per feature through
`IMeterFactory`.
**Why:** every service emits the same telemetry shape without each team re-learning it.

## 7. OpenAPI generated at build time and committed

**Decision:** `Microsoft.AspNetCore.OpenApi` (built in) generates `openapi/openapi.json` on
build (OpenAPI 3.1); CI fails if the committed file differs. The catalog's API entity points at
that file.
**Why:** the portal's API docs always match the code, and API changes show up in PR diffs.

## 8. Strict build

**Decision:** nullable reference types, warnings as errors, .NET analyzers (Recommended),
code style enforced in build, central package management, lock files with locked restore in CI
and Docker, NuGet audit of transitive packages.
**Why:** catch bugs and supply-chain problems at build time, reproducible builds.

## 9. xUnit v3 on Microsoft.Testing.Platform

**Decision:** one test project with Unit, Integration and Architecture folders, run by the
new `dotnet test` (Microsoft.Testing.Platform, set in `global.json`).
**Why:** current xUnit, fast, and one place to look. Split projects if it grows.
