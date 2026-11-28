# API, inputs and outputs

The contract is [`openapi/openapi.json`](https://github.com/${{ values.destination.owner }}/${{ values.destination.repo }}/blob/main/openapi/openapi.json)
(also shown on the API tab in the portal, and served live at `/openapi/v1.json`). This page
explains the behaviour behind it.

## Endpoints

| Method | Path | Success | Errors |
| --- | --- | --- | --- |
| POST | `/orders` | 201 + `Location` header + order summary | 400, 422 |
| GET | `/orders/{id}` | 200 + order with lines | 404 |
| GET | `/health` | 200 when every check passes | 503 |
| GET | `/alive` | 200 when the process is up | 503 |
| GET | `/openapi/v1.json` | 200 OpenAPI 3.1 document | |

## Inputs

`POST /orders`

```json
{ "customerId": "c-1", "lines": [{ "sku": "ABC-1", "quantity": 2, "unitPrice": 9.99 }] }
```

| Field | Rule |
| --- | --- |
| `customerId` | required, not blank (trimmed) |
| `lines` | 1 to 50 lines |
| `lines[].sku` | 1-32 letters, digits or hyphens; stored upper-case; unique within the order |
| `lines[].quantity` | integer 1 to 1000 (numbers as JSON numbers, not strings) |
| `lines[].unitPrice` | greater than 0 |
| order total | at most 10,000 |

## Outputs and errors

Every error is [ProblemDetails](https://www.rfc-editor.org/rfc/rfc9457) with
`content-type: application/problem+json`, a stable `code`, a `traceId` to find the request in
traces and logs, and `instance` (method and path).

| Status | `code` | When |
| --- | --- | --- |
| 400 | `validation_failed` | Input shape is wrong. `errors` lists every field problem, e.g. `lines[0]` |
| 404 | `order_not_found` | No order with that id |
| 422 | `order_duplicate_sku` | The same SKU is on two lines |
| 422 | `order_limit_exceeded` | Total is over the limit |
| 500 | | A bug or infrastructure fault; details are logged, not returned |
