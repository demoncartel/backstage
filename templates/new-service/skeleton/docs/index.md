# ${{ values.name }}

${{ values.description }}

- **Owner:** ${{ values.owner }}
- **System:** ${{ values.system }}
- **Sensitive data:** ${{ values.dataClassification }}

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness check |
