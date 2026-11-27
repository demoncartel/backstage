# Runbook: local Backstage for demoncartel

How the demoncartel Backstage instance is set up, how to run it day to day, and how to fix
the problems we have already hit. The repository `README.md` covers the configuration in
detail. This page is the operational view: steps, checks and fixes.

## What this is

| Part | Where | Notes |
| --- | --- | --- |
| Frontend | `packages/app`, served at http://localhost:3000 | New frontend system (`createApp` from `@backstage/frontend-defaults`) |
| Backend | `packages/backend`, served at http://localhost:7007 | New backend system; plugins registered in `packages/backend/src/index.ts` |
| Database | Postgres 16 in Docker (`docker-compose.yml`), or in-memory SQLite | SQLite (`yarn start:sqlite`) loses all data on every restart |
| Catalog discovery | `catalog.providers.github` in `app-config.yaml` | Reads `/catalog-info.yaml` on `main` in every demoncartel repo, every 30 min |
| Org import | `catalog.providers.githubOrg` in `app-config.yaml` | Imports org members and teams as Users and Groups, every 60 min |
| Sign-in | `auth.providers` in `app-config.yaml`, page in `packages/app/src/modules/signIn` | GitHub (org members) and Guest |
| Secrets | `.env` in the repo root (gitignored) | Loaded by `yarn start` / `yarn start:sqlite` through `node --env-file-if-exists=.env` |

How GitHub sign-in works: the GitHub OAuth App confirms who you are, then Backstage looks for a
catalog User whose name equals your GitHub login (resolver `usernameMatchingUserEntityName`).
Those Users only exist after the org import has run, so **sign-in depends on the org import**.

## Prerequisites (Windows)

| Tool | Version | Install |
| --- | --- | --- |
| Node.js | `^24.15.0` or `^26.13.0` (see `engines` in `package.json`) | `winget upgrade --id OpenJS.NodeJS.24 --exact` |
| Yarn | 4 (pinned in `.yarn/releases`) | `corepack enable`, see the note below |
| Python 3 | 3.12 works | `winget install --id Python.Python.3.12 --exact` (some native modules build with node-gyp) |
| Git | any recent | |
| Docker Desktop | for Postgres and TechDocs | Optional if you use SQLite |
| GitHub CLI | for signing in to GitHub from the terminal | `winget install --id GitHub.cli --exact` |

Things that caught us out on Windows:

- **`corepack enable` fails with `EPERM`** when Node is in `C:\Program Files\nodejs` and the shell
  isn't elevated. Either run it as administrator, or install the Yarn shim into your user npm folder,
  which is already on `PATH`:
  `corepack enable --install-directory "$env:APPDATA\npm" yarn`
- **Keep the clone at a short path**, such as `C:\Users\<you>\source\repos\backstage`. Deeply nested
  packages (for example `tree-sitter-yaml`) fail to build with "path longer than allowed for a Win32
  working directory" when the repo sits in a long folder path.
- **Open a new terminal after installing tools** so `PATH` picks them up.

## First-time setup

1. Clone and switch to the branch you want:
   ```powershell
   git clone https://github.com/demoncartel/backstage.git C:\Users\<you>\source\repos\backstage
   ```
2. Install dependencies from the repo root:
   ```powershell
   yarn install
   ```
3. Create your `.env` from the example:
   ```powershell
   Copy-Item .env.example .env
   ```
4. Fill in the values you have and **leave the rest commented out**. An empty value such as
   `GITHUB_TOKEN=` is an empty string, and the backend refuses to start with it.

### GitHub OAuth App (sign-in)

The org has one OAuth App for local use, **demoncartel Backstage (local)**, under
demoncartel → Settings → Developer settings → OAuth Apps. An org admin manages it and shares the
client ID and secret privately.

| Setting | Value |
| --- | --- |
| Homepage URL | `http://localhost:3000` |
| Redirect URI | `http://localhost:7007/api/auth/github/handler/frame` |
| Wildcard matching, device flow | Off |

Put the values in `.env`:

```
AUTH_GITHUB_CLIENT_ID=...
AUTH_GITHUB_CLIENT_SECRET=...
```

If you need a new secret, use **Generate a new client secret** on the app's page. GitHub shows it
only once. Delete old secrets you no longer use.

### GitHub token (discovery and org import)

The backend reads GitHub with `GITHUB_TOKEN`. Discovery needs read access to repository contents.
The org import also queries members' emails, so the token needs **`read:org`** and **`read:user`**
(or `user:email`). Without `read:user` the org import fails with "The 'email' field requires one of
the following scopes", and nobody can sign in with GitHub.

Two ways to supply it:

- **Your own token in `.env`** (recommended): `GITHUB_TOKEN=...`. See "Create a GitHub token" in the
  README for the read-only permissions.
- **Borrow your GitHub CLI login** for a local session, without writing the token anywhere. Add the
  scopes once, then start Backstage with the token in the environment:
  ```powershell
  gh auth refresh --hostname github.com --scopes read:user,user:email
  ```
  ```powershell
  $env:GITHUB_TOKEN = (gh auth token); yarn start:sqlite
  ```
  The CLI login can also write to repositories, which is broader than Backstage needs. A value that is
  already in the environment wins over `.env`.

## Day to day

| Task | Command |
| --- | --- |
| Start with Postgres | `docker compose up -d`, then `yarn start` |
| Start without Docker | `yarn start:sqlite` |
| Stop | `Ctrl+C` in the terminal running it |
| Type-check | `yarn tsc` |
| Validate config | `yarn backstage-cli config:check --config app-config.yaml` |
| Stop Postgres and delete its data | `docker compose down -v` |

`.env` is only read at startup. Restart after changing it.

## Checking it works

1. Backend health returns `{"status":"ok"}`:
   ```powershell
   curl.exe http://localhost:7007/.backstage/health/v1/readiness
   ```
2. In the startup log, look for:
   - `Configuring auth provider: github` with no `Skipping github auth provider` warning after it.
   - `Read N GitHub repositories` from `github-provider:demoncartel`.
   - `Reading GitHub users and teams for org: demoncartel` with no `refresh failed` after it.
3. Open http://localhost:3000. The sign-in page shows **GitHub** and **Guest**. Sign in with GitHub
   and check that your profile shows your GitHub login.

The frontend listens on IPv6 (`[::1]:3000`). If a script probing `127.0.0.1:3000` says it's down,
try `http://[::1]:3000`.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Backend exits with `Invalid type in config for key 'integrations.github[0].token' … got empty-string` | `GITHUB_TOKEN=` is present but empty in `.env` | Comment the line out or give it a value, then restart |
| GitHub sign-in returns 404 "Auth provider registered for 'github' is misconfigured" | `AUTH_GITHUB_CLIENT_ID` or `AUTH_GITHUB_CLIENT_SECRET` missing when the backend started | Add both to `.env`, save, restart. Check the log for `Skipping github auth provider` |
| GitHub sign-in says the user was not found | The org import hasn't run or failed, so there is no User for your login | Check the log for `GithubMultiOrgEntityProvider … refresh failed`; fix the token scopes; wait for the next run or restart |
| Org import fails with "The 'email' field requires one of the following scopes" | Token lacks `read:user` / `user:email` | `gh auth refresh --scopes read:user,user:email`, or use a token with those scopes |
| "Login failed … Auth refresh request failed, TypeError: Failed to fetch" | The backend was down or restarting | Wait for the backend health check to pass, then reload the page |
| Backend fails with `IPC request 'DevDataStore.load' … timed out` | Restarted too soon after killing the previous dev server | Make sure no old `node` processes hold ports 3000/7007, then start again |
| `yarn` not found after `corepack enable` | Shim couldn't be written to `C:\Program Files\nodejs` | `corepack enable --install-directory "$env:APPDATA\npm" yarn` |
| Native module build fails with "path longer than allowed" | Repo is in a deep folder | Move the clone to a short path and reinstall |
| `docker: … dockerDesktopLinuxEngine … cannot find the file` | Docker Desktop isn't running or is waiting on a dialog | Start Docker Desktop and finish any prompts, or use `yarn start:sqlite` |

To find and stop leftover dev-server processes:

```powershell
netstat -ano | Select-String 'LISTENING' | Select-String ':3000 |:7007 '
```

Then stop the listed PIDs in Task Manager, or with `Stop-Process -Id <pid>`.

## Production notes

The Docker image (`yarn build-image`, `NODE_ENV=production`) layers `app-config.production.yaml`
over `app-config.yaml`. Outside development a misconfigured auth provider stops the backend instead
of being skipped, so:

- Set `AUTH_GITHUB_CLIENT_ID` / `AUTH_GITHUB_CLIENT_SECRET` from an OAuth App whose redirect URI uses
  the deployed backend URL, plus `GITHUB_TOKEN` and `POSTGRES_*`.
- Remove the `guest` provider from `app-config.production.yaml`. It refuses to run in production.
- Enable permissions with a real policy before exposing it to anyone.

## Security

- Never commit `.env`, tokens or client secrets. `.env` and `app-config.local.yaml` are gitignored.
- Each person uses their own `GITHUB_TOKEN`. Only the OAuth App's client ID and secret are shared, and
  only privately.
- If a secret leaks, revoke it straight away: regenerate the OAuth App's client secret, or delete the
  token in GitHub settings.
