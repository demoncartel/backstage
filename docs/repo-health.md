# Repo health scanner

The **Repo Health** plugin scans the GitHub repo behind every catalog Component on a schedule and
shows what it found on the component's overview page and on an estate-wide **Repo Health** page
(sidebar).

It is deterministic and token-free: plain parsing plus free public data. No AI or LLM calls, no paid
services. The scan runs in the backend and stores its results; the UI only displays them.

| Part                                               | Package                       |
| -------------------------------------------------- | ----------------------------- |
| Backend (scheduler, collectors, storage, REST API) | `plugins/repo-health-backend` |
| Frontend (entity card, estate page)                | `plugins/repo-health`         |
| Shared types                                       | `plugins/repo-health-common`  |

## What is collected

| Fact                    | Read from                                                                                                                                                                          | How                                                                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| .NET target frameworks  | `*.csproj`, `*.fsproj`, `*.vbproj`, nearest `Directory.Build.props`                                                                                                                | `TargetFramework`, `TargetFrameworks` (plural), legacy `TargetFrameworkVersion`; simple `$(Property)` references are expanded                                                     |
| .NET SDK                | `global.json`                                                                                                                                                                      | `sdk.version`                                                                                                                                                                     |
| .NET container images   | `Dockerfile`, `*.Dockerfile`, `Containerfile`                                                                                                                                      | `FROM mcr.microsoft.com/dotnet/{sdk,aspnet,runtime,runtime-deps}:<tag>`, with `ARG` defaults substituted                                                                          |
| Support status          | [Microsoft releases-index.json](https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json)                                                               | Supported / EOL soon (within `eolSoonDays`, default 180) / End of life / Preview. Cached for 24 hours. .NET Framework uses a small built-in table from Microsoft's lifecycle page |
| NuGet packages          | `PackageReference` in project files, `Directory.Packages.props` (central package management, `VersionOverride`, `GlobalPackageReference`), `packages.lock.json`, `packages.config` | Exact versions only; ranges and floating versions are counted as "not checked"                                                                                                    |
| Vulnerabilities         | [OSV.dev](https://osv.dev) batch API, ecosystem NuGet (GitHub Advisory Database data)                                                                                              | Severity, GHSA/CVE ids, first fixed version, link to the advisory                                                                                                                 |
| Outdated packages       | nuget.org flat-container API                                                                                                                                                       | Latest stable version; packages 2+ majors behind are counted                                                                                                                      |
| Node.js version (bonus) | `package.json` `engines.node`, `.nvmrc`, `.node-version`, `node:<n>` images                                                                                                        | Status from the official [Node.js release schedule](https://github.com/nodejs/Release)                                                                                            |

Without a `packages.lock.json`, only **direct** references are checked: transitive packages (for
example the JWT libraries pulled in by `Microsoft.AspNetCore.Authentication.JwtBearer`) need a lock
file. The card says so when that applies.

### Which repo belongs to a component

1. `github.com/project-slug` annotation (`owner/repo`). If `backstage.io/source-location` points at
   the same repo with a `tree/<branch>/<dir>` URL, the scan is limited to that branch and folder
   (monorepos).
2. Otherwise `backstage.io/source-location`.
3. Otherwise the directory of `backstage.io/managed-by-location`.

The default branch is used unless the annotation names one. `bin/`, `obj/`, `node_modules/`,
`vendor/` and `dist/` are ignored. At most `maxFilesPerRepo` files are read per repo.

## How often

Every 6 hours, first run 1 minute after the backend starts (after GitHub discovery has loaded the
catalog). Press the refresh button on a component's card to scan just that one now.

## Configuration

`app-config.yaml`:

```yaml
repoHealth:
  schedule: # standard Backstage schedule definition
    frequency: { hours: 6 }
    timeout: { minutes: 30 }
    initialDelay: { minutes: 1 }
  eolSoonDays: 180 # amber window before end of support
  kinds: [Component] # catalog kinds to scan
  maxFilesPerRepo: 200 # GitHub API reads per repo per scan
  concurrency: 3 # repos scanned in parallel
  nuget:
    checkOutdated: true # look up latest versions on nuget.org
```

GitHub access uses `integrations.github` (the same `GITHUB_TOKEN` as catalog discovery, or a GitHub
App). It only needs read access to repo contents.

Outbound HTTPS is needed to `api.github.com`, `dotnetcli.blob.core.windows.net`, `api.osv.dev`,
`api.nuget.org` and `raw.githubusercontent.com` (Node.js schedule).

## API

All routes need a Backstage user or service token, except `/health`.

| Route                                                                  | Returns                                     |
| ---------------------------------------------------------------------- | ------------------------------------------- |
| `GET /api/repo-health/reports`                                         | Summary rows for every scanned entity       |
| `GET /api/repo-health/reports/by-entity?entityRef=component:default/x` | The full report (404 if not scanned yet)    |
| `POST /api/repo-health/scan` with `{"entityRef": "..."}`               | Scans one entity now and returns its report |
| `POST /api/repo-health/scan` with no body                              | Starts a full scan in the background (202)  |

Results are stored in the plugin's own database table (`repo_health_reports`), which works on SQLite
and Postgres. With `yarn start:sqlite` they are lost on restart and rebuilt by the first scan.

## Adding a collector

A collector reads files from the repo and writes its own section of the report. Collectors run in
order, must be deterministic, and must not call AI services.

```ts
import { createBackendModule } from '@backstage/backend-plugin-api';
import { repoHealthCollectorsExtensionPoint } from '@internal/backstage-plugin-repo-health-backend';

export default createBackendModule({
  pluginId: 'repo-health',
  moduleId: 'codeowners',
  register(env) {
    env.registerInit({
      deps: { collectors: repoHealthCollectorsExtensionPoint },
      async init({ collectors }) {
        collectors.addCollector({
          id: 'codeowners',
          async collect({ files, report, warn }) {
            const has = files.paths.some(p => /(^|\/)CODEOWNERS$/.test(p));
            if (!has) warn('No CODEOWNERS file');
          },
        });
      },
    });
  },
});
```

Register it with `backend.add(...)` in `packages/backend/src/index.ts`. For a new fact with its own
UI, add a field to `RepoHealthReport` in `plugins/repo-health-common`, fill it in the collector, and
render it in `RepoHealthCard`. Built-in collectors live in
`plugins/repo-health-backend/src/collectors` and their parsers (pure functions with unit tests) in
`src/parsers`.

## Licences

Every new code dependency is free and permissively licensed: Backstage packages (Apache-2.0),
Express, express-promise-router, Knex and Material UI v4 (MIT). No commercial plugins and no
copyleft dependencies.

The data sources are free public APIs, queried read-only at scan time and not bundled with the code:
OSV.dev (NuGet advisories come from the GitHub Advisory Database, CC-BY-4.0, so keep the advisory
links when showing them), Microsoft's .NET release metadata, nuget.org's public API and the Node.js
release schedule published in `nodejs/Release`.
