# repo-health frontend

Displays the results stored by `@internal/backstage-plugin-repo-health-backend`. It never scans by
itself (apart from the card's "scan now" button, which asks the backend).

- **Entity card** (`entity-card:repo-health/repo-health`) on the Overview tab of every Component:
  .NET versions with a support status chip, vulnerable package count with the top findings linking
  to their advisories, packages 2+ majors behind, and when it was last scanned.
- **Repo Health page** (`/repo-health`, in the sidebar): every component with owner, system,
  versions, status and vulnerability counts. Sortable, searchable, with filters for status, owner
  and system (e.g. show everything that is End of life).

Installed automatically through `app.packages: all` once it is a dependency of `packages/app`.
See [`docs/repo-health.md`](../../docs/repo-health.md).
