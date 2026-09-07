---
name: Imported schema baselines
description: How to baseline a live schema whose historical object names differ from clean migration output.
---

Fingerprint the reconciled live database shape when baselining an imported system, rather than assuming a clean replay of historical migrations produces identical metadata. Use the exact baseline fingerprint only until future migrations are recorded; afterward, immutable ledger checksums and dispositions are the durable history.

**Why:** Imported databases can have equivalent but historically different metadata, such as constraint names. A permanent exact historical fingerprint also rejects legitimate columns or constraints added by later migrations.

**How to apply:** Before the first baseline, verify the approved live inventory exactly and record historical files without executing them. For later verification, reject checksum or ledger drift while allowing recorded future migrations to evolve the schema.