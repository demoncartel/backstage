# ${{ values.name }}

${{ values.description }}

| | |
| --- | --- |
| **Owner** | ${{ values.owner }} |
| **System** | ${{ values.system }} |
| **Sensitive data** | ${{ values.dataClassification }} |
| **Stack** | .NET 11, C# 15, ASP.NET Core minimal APIs |
| **API** | [`openapi/openapi.json`](https://github.com/${{ values.destination.owner }}/${{ values.destination.repo }}/blob/main/openapi/openapi.json), also served at `/openapi/v1.json` |

Created from the **.NET service (golden path)** template in the developer portal. It starts
with one example feature, **Orders** (create and get), that shows the pattern. Replace it with
your own features and keep the rules.

## Run it

```sh
dotnet run --project src/${{ values.pascalName }}   # http://localhost:8080
dotnet test                                          # unit, integration and architecture tests
dotnet format                                        # fix formatting before you push
```

Try it:

```sh
curl -s localhost:8080/health
curl -s -X POST localhost:8080/orders -H 'content-type: application/json' \
  -d '{"customerId":"c-1","lines":[{"sku":"ABC-1","quantity":2,"unitPrice":9.99}]}'
```

## Where to look next

- [Architecture](architecture.md): how the code is laid out and the rules the tests enforce.
- [Design decisions](decisions.md): why it is built this way.
- [API, inputs and outputs](api.md): what goes in, what comes out, every error.
- [Operations and failure modes](operations.md): telemetry, health checks and what breaks.

Keep these pages current: they are this service's documentation in the portal, and the
template's promise is that a service documents itself.
