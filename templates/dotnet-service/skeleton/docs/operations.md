# Operations and failure modes

## Running

| Setting | Default | Notes |
| --- | --- | --- |
| `ASPNETCORE_HTTP_PORTS` | `8080` in the container | Port to listen on |
| `Service__Name` | `${{ values.name }}` | `service.name` on all telemetry |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset | Set to a collector (e.g. `http://otel-collector:4317`) to export traces, metrics and logs |
| `OTEL_RESOURCE_ATTRIBUTES` | unset | Extra resource attributes, standard OTel format |
| `Logging__Console__FormatterName` | `json` (`simple` in Development) | Console log format |

The container image is chiseled Ubuntu: no shell, no package manager, runs as non-root
(`app`, UID 1654), listens on 8080. Because there is no shell, use your orchestrator's HTTP
probes rather than a Docker `HEALTHCHECK`:

- **Liveness:** `GET /alive` (only checks tagged `live`)
- **Readiness:** `GET /health` (every registered check). Add a check for each dependency you
  add, such as a database.

## Telemetry

| Signal | What you get |
| --- | --- |
| Traces | ASP.NET Core server spans (health probes excluded), outgoing HttpClient spans, and `CreateOrder` spans from the `${{ values.pascalName }}.Orders` source |
| Metrics | `http.server.*`, Kestrel, `http.client.*`, .NET runtime (GC, thread pool), and `orders.placed`, `orders.rejected` (tagged `error.code`), `orders.value` |
| Logs | Structured, with trace and span ids; `Order {OrderId} placed...` and `Order rejected: {ErrorCode}` |

Name new ActivitySources and Meters `${{ values.pascalName }}.<Feature>` and they are exported
automatically.

## Failure modes

| What happens | What you see | What to do |
| --- | --- | --- |
| Client sends bad input | 400 with `errors`; `orders.rejected{error.code=validation_failed}` rises | Client fix; check the field names in `errors` |
| Business rule refuses the order | 422 with `code`; `orders.rejected` by code | Expected; a sudden rise usually means a client change |
| Unhandled exception | 500 ProblemDetails with `traceId`; error log with the stack trace | Find the trace by `traceId`; it is a bug: add a test |
| Process restarts | **All orders are lost**: the example store is in memory | Replace `InMemoryOrderStore` with a real store before production |
| More than one instance | Each instance has its own orders; GET can 404 for an order another instance created | Same: use a shared store |
| Collector unreachable | Telemetry is dropped after retries; the service keeps serving | Check `OTEL_EXPORTER_OTLP_ENDPOINT` and the collector |
| Vulnerable package published | Build fails with NU190x (NuGet audit, warnings as errors) | Update the package in `Directory.Packages.props` |
| OpenAPI file out of date | CI fails at "OpenAPI document is committed and up to date" | Run `dotnet build` and commit `openapi/openapi.json` |
