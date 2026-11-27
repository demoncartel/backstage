# Runbook

| Alert or change | Meaning | First step |
| --- | --- | --- |
| `LedgerImbalance` | Daily trial balance is not zero | Stop the end-of-day job and page team-accounts; never fix entries by hand |
| `JournalPostLatencyHigh` | p99 over 300 ms | Check ledger-db replication lag |
