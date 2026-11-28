# Architecture

## Vertical slices

Code is grouped by **feature and use case**, not by technical layer. Everything one use case
needs sits in one folder, so a change usually touches one folder.

```text
src/${{ values.pascalName }}/
  Program.cs                       composition root: one line per feature
  Shared/                          Result, Option, Error, and Error -> HTTP mapping
  Features/
    Orders/
      OrdersModule.cs              AddOrders() / MapOrders(): the feature's wiring
      IOrderStore.cs               the feature's one port (+ InMemoryOrderStore)
      OrdersTelemetry.cs           metrics and spans for the feature
      Domain/                      pure business rules shared by the slices
        Order.cs, OrderLine.cs, OrderId.cs, OrderErrors.cs
      CreateOrder/                 one slice = one use case
        CreateOrderEndpoint.cs     HTTP edge: bind, call handler, map result
        CreateOrderRequest.cs      input contract
        CreateOrderResponse.cs     output contract
        CreateOrderValidation.cs   pure shape checks
        CreateOrderHandler.cs      orchestration and side effects
      GetOrder/
        ...
src/${{ values.pascalName }}.ServiceDefaults/   telemetry, health, ProblemDetails: wired once
tests/${{ values.pascalName }}.Tests/
  Unit/            pure domain and validation, no host
  Integration/     the real app over HTTP with WebApplicationFactory
  Architecture/    the rules below, as tests
```

To add a use case, copy a slice folder, rename, and map it in the feature's module. To add a
feature, add `Features/<Feature>/` with its own module and add one line to `Program.cs`.

## Functional core, imperative shell

Each request flows along a "railway":

```text
request -> Validate -> Domain rule(s) -> Save / side effects -> Response
              |             |                   |
              +-------------+--- Error ---------+-> ProblemDetails
```

- **Validation** and the **domain** are pure functions. They take values and return
  `Result<T>`: no I/O, no clock, no logging, no exceptions for business rules.
- **Handlers** are the shell. They read the clock, create ids, call the store, log and record
  metrics, and compose the pure steps with `Bind` and `Map`.
- **Endpoints** turn `Result<T>` into HTTP with `Match`: success becomes 200/201, an `Error`
  becomes ProblemDetails through one mapping in `Shared/Http`.

Because the core is pure, the unit tests need no mocks: inputs in, result out.

## Rules enforced by tests

`tests/.../Architecture/ArchitectureTests.cs` uses ArchUnitNET to fail the build when:

| Rule | Why |
| --- | --- |
| `Features.*.Domain` depends on ASP.NET Core, `Microsoft.Extensions.*` (logging, DI, config), OpenTelemetry, `System.Net`, `System.IO`, `System.Data`, metrics or `Task` | The domain is pure and synchronous; I/O is the handler's job |
| `Features.*.Domain` uses `TimeProvider`, `Random`, `Environment`, `Console` or `Activity` | Time, randomness and environment are passed in, so results are deterministic |
| `Features.*.Domain` depends on a slice or a port | Slices depend on the domain, never the reverse |
| A domain record has a settable property or mutable field | Domain values are immutable |
| A `*Validation` type touches I/O or a store | Validation looks only at the request |
| `Shared` depends on `Features` | Shared code stays generic |
| A slice depends on a sibling slice | Slices change independently; share through the domain or a port |

The rules work on compiled IL, so a `const` or `nameof` from another slice is not detected
(the compiler inlines it). Everything else is.
