# repo-health backend

Scheduled, deterministic scanner for the repos behind catalog Components. For each one it reads the
repo through the GitHub API (using `integrations.github`) and stores:

- .NET target frameworks, SDK (`global.json`) and `mcr.microsoft.com/dotnet/*` image tags, with
  support status from Microsoft's release metadata
- NuGet package versions (project files, central package management, lock files) checked for known
  vulnerabilities with OSV.dev, and against the latest stable version on nuget.org
- Node.js versions (`engines.node`, `.nvmrc`, `node:` images) with status from the Node.js schedule

No AI/LLM calls and no paid services. Results go into the plugin's own table (Knex; SQLite and
Postgres) and are served at `/api/repo-health`.

Full docs (what is collected, config, API, adding collectors): [`docs/repo-health.md`](../../docs/repo-health.md).

## Install

```ts
// packages/backend/src/index.ts
backend.add(import('@internal/backstage-plugin-repo-health-backend'));
```

## Configure (optional)

```yaml
repoHealth:
  schedule:
    frequency: { hours: 6 }
    timeout: { minutes: 30 }
    initialDelay: { minutes: 1 }
  eolSoonDays: 180
  nuget:
    checkOutdated: true
```

## Extend

Add collectors from a backend module through `repoHealthCollectorsExtensionPoint`. See the docs.

## Layout

| Path                                                               | What                                                                           |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `src/parsers`                                                      | Pure parsers (MSBuild, global.json, Dockerfile, TFMs, Node specs), unit tested |
| `src/lifecycle`                                                    | .NET and Node.js support status, with cached release metadata                  |
| `src/advisories`                                                   | OSV.dev and nuget.org clients                                                  |
| `src/collectors`                                                   | `dotnet`, `nuget`, `node` collectors and the collector interface               |
| `src/sources/github.ts`                                            | Entity → repo resolution and read-only GitHub access                           |
| `src/scanner.ts`, `src/store.ts`, `src/router.ts`, `src/plugin.ts` | Orchestration, storage, REST API, wiring                                       |
