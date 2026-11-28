# ${{ values.name }}

${{ values.description }}

A .NET 11 / C# 15 minimal API created from the **.NET service (golden path)** template in the
developer portal: vertical slices, a functional core (Result/Option, immutable records),
OpenTelemetry, health checks, OpenAPI, architecture tests, a chiseled container and CI.

Full documentation is in [`docs/`](docs/index.md) and on the service's Docs tab in the portal.

## Run it

```sh
dotnet run --project src/${{ values.pascalName }}   # http://localhost:8080/health
dotnet test
dotnet format --verify-no-changes
docker build -t ${{ values.name }} . && docker run --rm -p 8080:8080 ${{ values.name }}
```

Requires the .NET 11 SDK (see `global.json`).

## Layout

| Path | What |
| --- | --- |
| `src/${{ values.pascalName }}/Features/<Feature>/<UseCase>/` | One folder per use case: endpoint, request/response, validation, handler |
| `src/${{ values.pascalName }}/Features/<Feature>/Domain/` | Pure business rules |
| `src/${{ values.pascalName }}/Shared/` | `Result`, `Option`, `Error` and Error-to-HTTP mapping |
| `src/${{ values.pascalName }}.ServiceDefaults/` | Telemetry, health checks, ProblemDetails |
| `tests/${{ values.pascalName }}.Tests/` | Unit, integration and architecture tests |
| `openapi/openapi.json` | Generated on build, committed, checked in CI |
| `catalog-info.yaml` | Portal entry: the service and its API |
