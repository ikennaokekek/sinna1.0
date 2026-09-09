---
name: Ambiguous operator writes
description: Settlement rules for bounded operator commands that mutate PostgreSQL durably.
---

Ambiguous operator writes must record append-only operation evidence in the same transaction as the mutation. Never infer commitment from a mutable business row.

**Why:** Concurrent processing can overwrite mutable state before an ambiguity resolver reads it. A ledger miss before backend termination is also insufficient: commit can become visible between that miss and observing the backend disappear.

**How to apply:** Quarantine ambiguous connections, bound settlement observation, and reread immutable operation evidence after the original backend is gone before declaring rollback. If evidence cannot be established, report an explicit unknown outcome rather than failure.