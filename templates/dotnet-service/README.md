# .NET service (golden path) template

Scaffolder template that creates a .NET 11 / C# 15 minimal API: vertical slices, a functional
core (Result/Option, immutable records), OpenTelemetry via a ServiceDefaults project, health
checks, build-time OpenAPI, unit + integration + ArchUnitNET architecture tests, a chiseled
non-root Dockerfile, GitHub Actions CI, TechDocs and a catalog entry (Component + API).

The design rationale ships with every generated service in `skeleton/docs/decisions.md` and
`skeleton/docs/architecture.md`.

## Templating notes

- Everything under `skeleton/` is rendered with `${{ values.x }}`, so C# braces are safe. Avoid
  `{%`, `{#` and `#}` in skeleton files: nunjucks reads them as tags.
- `.github/workflows/*` is copied without templating (`copyWithoutTemplating`) because GitHub
  Actions uses `${{ }}` too.
- `values.pascalName` is derived from the name in `template.yaml`
  (`interest-service` becomes `InterestService`) and names the projects and namespaces.

## Generated files in the skeleton

`skeleton/openapi/openapi.json` and the three `packages.lock.json` files are build outputs,
committed so the catalog API entity resolves immediately and CI can restore in locked mode.
After changing endpoints or packages, render the skeleton, run `dotnet build`, and copy them
back, replacing the service name with `${{ values.name }}`, `InterestService` with
`${{ values.pascalName }}` and `interestservice` with `${{ values.pascalName | lower }}`.
CI in a generated repo fails if either drifts, so a stale copy is caught on the first push.
