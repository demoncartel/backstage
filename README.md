# demoncartel Backstage

Shared local [Backstage](https://backstage.io) instance (v1.57, new backend system) for the
[demoncartel](https://github.com/demoncartel) org, kept in git so everyone runs the same config.

What's configured:

| Area | Setup |
| --- | --- |
| Catalog discovery | GitHub provider scans every repo in `demoncartel` for `/catalog-info.yaml` on `main`, every 30 min |
| Database | Postgres 16 via `docker-compose.yml` (default), or in-memory SQLite for zero-dependency runs |
| TechDocs | `builder: local`, `generator.runIn: docker`, `publisher: local` |
| Auth | GitHub sign-in for demoncartel members, plus guest (local development only) |
| Org data | GitHub org members and teams imported as Users/Groups, every 60 min |
| Catalog kinds | Component, System, API, Group, Resource, Location (User/Group from the GitHub org import and local files) |

## Prerequisites

- **Node.js 24** (this Backstage version requires `^24.15.0 || ^26.13.0`, see `engines` in `package.json`)
- **Yarn 4** via Corepack: `corepack enable` (the repo pins Yarn in `.yarn/releases`)
- **Git**
- **Docker**, for the local Postgres container *and* for building TechDocs
- A GitHub token (see below) so discovery can read the org

## Quick start

```sh
corepack enable
cp .env.example .env        # then put your GITHUB_TOKEN in .env
docker compose up -d        # local Postgres 16
yarn install
yarn start                  # UI http://localhost:3000, backend http://localhost:7007
```

`yarn start` loads `.env` automatically (`node --env-file-if-exists=.env`), so you don't need to
export anything. `.env` and `app-config.local.yaml` are gitignored: **never commit tokens**.

### No Docker? Use SQLite

```sh
yarn install
yarn start:sqlite
```

This layers `app-config.sqlite.yaml` on top of the base config and uses an in-memory SQLite
database. Everything is lost when you stop it, and TechDocs won't build without Docker
(or `techdocs.generator.runIn: local` plus `pip install mkdocs-techdocs-core`).

Without `GITHUB_TOKEN` (the line commented out, not left empty), Backstage still starts; the GitHub discovery provider just logs
warnings and finds nothing.

## Create a GitHub token

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → *Generate new token*.
2. **Resource owner:** `demoncartel` (an org admin may need to approve it). **Repository access:** all repositories.
3. **Repository permissions** (all read-only): *Contents: Read* and *Metadata: Read*.
   **Organization permissions** (read-only): *Members: Read*, for the org import that GitHub sign-in uses. Nothing else.
4. Put the token in `.env` as `GITHUB_TOKEN=...`. Each person uses their own token.

## GitHub sign-in

The sign-in page offers **GitHub** and **Guest**. GitHub sign-in uses an OAuth App owned by the org and
signs you in as the catalog User whose name matches your GitHub login. Those Users are imported from the
org by `catalog.providers.githubOrg`, so only demoncartel members can sign in with GitHub.

One-time setup (an org admin creates the app once and shares its ID and secret privately):

1. GitHub → **demoncartel** org → Settings → Developer settings → **OAuth Apps** → *New OAuth App*.
2. **Homepage URL:** `http://localhost:3000`. **Authorization callback URL:**
   `http://localhost:7007/api/auth/github/handler/frame`.
3. Generate a client secret, then put both values in your `.env` as `AUTH_GITHUB_CLIENT_ID=...` and
   `AUTH_GITHUB_CLIENT_SECRET=...`. Never commit them.
4. Make sure your `GITHUB_TOKEN` has *Members: Read* (see above), restart, and wait for the first org
   import (about 15 seconds after startup). Then choose **GitHub** on the sign-in page.

If the OAuth variables are not set, the GitHub provider is skipped with a warning and Guest still works.
If GitHub sign-in says your user was not found, the org import hasn't run or your token lacks *Members: Read*.
The org import also reads members' emails: with a classic token or the GitHub CLI login that needs the
`read:user` (or `user:email`) scope. See [docs/runbook.md](docs/runbook.md) for running and troubleshooting.

## Acme Bank demo and the org setting

Which org Backstage reads is set by `GITHUB_ORG` in `.env` (default `demoncartel`), and the portal's
name by `APP_TITLE` and `ORG_DISPLAY_NAME`. `demo/` holds a fictional digital bank, **Acme Bank**:
twelve repos with services, APIs, resources, systems and TechDocs, plus a script that creates them in
any org. `templates/new-service` is a **Create a new service** template. See
[demo/README.md](demo/README.md) for setup and a five-minute demo script.

## How discovery works

`app-config.yaml` → `catalog.providers.github.org` uses
`@backstage/plugin-catalog-backend-module-github` (registered in `packages/backend/src/index.ts`).
It queries GitHub for files named `catalog-info.yaml` at the root of every repo (branch `main`) in the
`GITHUB_ORG` org (default `demoncartel`) and registers whatever it finds. Change `schedule`, `filters.repository` (a regex) or
`catalogPath` there. Entities that are removed from GitHub are removed from the catalog on the next run.

Local entities (the `guest` user and `guests` group) live in `catalog/org.yaml`.

### Add a repo to the catalog

Add a `catalog-info.yaml` to the root of the repo's `main` branch, for example:

```yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: my-service
  annotations:
    github.com/project-slug: demoncartel/my-service
    backstage.io/techdocs-ref: dir:. # optional, needs mkdocs.yml + docs/
spec:
  type: service
  lifecycle: production
  owner: group:guests
```

It appears after the next discovery run (≤30 min). To see it immediately, use **Create → Register
Existing Component** in the UI and paste the URL of the file.

### bad-app-sample

[`demoncartel/bad-app-sample`](https://github.com/demoncartel/bad-app-sample) gets its `catalog-info.yaml`
from [PR #1](https://github.com/demoncartel/bad-app-sample/pull/1). Until that is merged, discovery
(which reads `main`) won't see it. Either merge the PR, or uncomment the static `catalog.locations`
entry for the `backstage-catalog` branch in `app-config.yaml`.

## TechDocs

Docs are built on demand when you open them in the UI, using the `spotify/techdocs` Docker image, so
**Docker must be running**. Output is stored locally (`publisher: local`). This repo's own docs are in
`docs/` + `mkdocs.yml`. For anything beyond local use, build docs in CI and publish to cloud storage
([guide](https://backstage.io/docs/features/techdocs/how-to-guides#how-to-migrate-from-techdocs-basic-to-recommended-deployment-approach)).

## Useful commands

| Command | What it does |
| --- | --- |
| `yarn start` | Run frontend + backend (Postgres) |
| `yarn start:sqlite` | Run with in-memory SQLite |
| `yarn tsc` | Type-check |
| `yarn build:backend` | Build the backend bundle |
| `yarn build-image` | Build the backend Docker image (production config) |
| `docker compose down -v` | Stop Postgres and delete its data |

## Next steps

- **Turn off guest sign-in** once everyone uses GitHub: remove `guest` from `auth.providers` and from
  `packages/app/src/modules/signIn`, then enable permissions with a real policy.
- ~~**GitHub sign-in**~~ (done, see above): create a GitHub OAuth App, add the `github` provider under
  `auth.providers` with a sign-in resolver and register `@backstage/plugin-auth-backend-module-github-provider`
  ([docs](https://backstage.io/docs/auth/github/provider)). The package is already a dependency.
- ~~**GitHub org data:**~~ (done) add `@backstage/plugin-catalog-backend-module-github-org` to import teams and members as Groups/Users
  (needs a token with org member read access).
- **Deploy** to Azure Container Apps: use `yarn build-image` and `app-config.production.yaml`, with managed Postgres and
  secrets for `GITHUB_TOKEN` / `POSTGRES_*` / `AUTH_GITHUB_CLIENT_ID` / `AUTH_GITHUB_CLIENT_SECRET` (an OAuth App
  whose callback URL uses the deployed backend URL). Outside development the backend refuses to start if the
  GitHub sign-in variables are missing, and the guest provider must be removed from `app-config.production.yaml`.
  Enable permissions first.
- Replace the guest group owner (`group:guests`) with real teams once they exist in the catalog.
