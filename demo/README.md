# Acme Bank demo

Sample content that turns this Backstage into a convincing demo: **Acme Bank**, a fictional digital
bank with four teams, four systems, twelve repositories, seven APIs and five infrastructure
resources. Services are tagged `pii`, `pci` and `sox`, so you can show compliance views such as
"everything in PCI DSS scope" in one click.

| System | Owner | Repositories |
| --- | --- | --- |
| Customer Experience | team-customer | customer-web-app, onboarding-service |
| Accounts & Ledger | team-accounts | accounts-service, ledger-service, statements-service |
| Payments & Cards | team-payments | payments-service, fraud-detection-service, card-service |
| Platform | team-platform | api-gateway, notification-service, platform-infrastructure, software-catalog |

`platform-infrastructure` also defines the Resources (`ledger-db`, `accounts-db`, `payments-db`,
`card-vault`, `event-bus`), and `software-catalog` defines the Systems.

## What's here

| Path | What it is |
| --- | --- |
| `demo/repos/<name>/` | The files pushed to each demo repo: `catalog-info.yaml`, `README.md`, and for some an `openapi.yaml` or TechDocs (`mkdocs.yml`, `docs/`). `__ORG__` is replaced with the org name when seeding. |
| `demo/generate-repos.mjs` | Generates `demo/repos` from the data at its top. Edit it and re-run `node demo/generate-repos.mjs .` to change the company, services or wording. |
| `demo/seed.ps1` | Creates the teams and repos in a GitHub org and pushes the content. Dry run unless you add `-Apply`. |
| `templates/new-service/` | The **Create a new service** software template (registered in `app-config.yaml`). |

## Set up a demo org

1. Use a GitHub org you control. A neutral name works best in front of prospects, because it shows in
   every URL.
2. Make sure the GitHub CLI can create repos and teams there:
   ```powershell
   gh auth refresh --hostname github.com --scopes admin:org,read:user,user:email
   ```
   `admin:org` is only needed to create the four teams. If you'd rather not grant it, create
   `team-customer`, `team-accounts`, `team-payments` and `team-platform` in the org's Teams page first.
3. Preview, then apply:
   ```powershell
   .\demo\seed.ps1 -Org <your-org>
   ```
   ```powershell
   .\demo\seed.ps1 -Org <your-org> -Apply
   ```
   Re-running is safe: it skips what exists and only pushes when content changed.
4. Point the portal at the org in `.env` and restart:
   ```
   GITHUB_ORG=<your-org>
   APP_TITLE=Acme Bank Developer Portal
   ORG_DISPLAY_NAME=Acme Bank
   ```
   Discovery and the org import start 15 seconds after startup.

The repos are private. To remove the demo, delete the repos and teams in the org's settings.

## A five-minute demo

1. **Sign in with GitHub.** You land as a member of the Acme teams the seed script created.
2. **Catalog.** Filter by kind, owner or tag. Filter tags to `pci` to show everything in PCI DSS scope:
   `card-service`, `fraud-detection-service` and the `card-vault`.
3. **A service page** (`payments-service`). Owner, system, the APIs it provides and consumes, and the
   resources it depends on. Open **Dependencies** to see the graph.
4. **APIs.** Open `payments-api` and show the OpenAPI definition rendered in the portal.
5. **Docs.** `ledger-service` has TechDocs with a runbook. TechDocs builds need Docker running.
6. **Create.** Run **Create a new service**: pick a name, `team-accounts`, the `accounts` system and
   "Personal data (PII)". A minute later there's a new repo with code, CI, docs and a catalog entry,
   and it already shows up tagged `pii`.
7. **The pitch:** a repo with a `catalog-info.yaml` appears on its own within 30 minutes, ownership
   comes from GitHub teams, and nobody maintains a spreadsheet of services.

The template creates a real repository. Delete it after the demo, or reuse it next time.
