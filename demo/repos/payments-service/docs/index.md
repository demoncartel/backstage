# Payments service

Flow: **balance check → fraud decision → ledger booking → scheme submission**. Every request needs an Idempotency-Key, so retries never send money twice.
