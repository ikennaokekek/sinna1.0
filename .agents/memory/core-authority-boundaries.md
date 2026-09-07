---
name: Core authority boundaries
description: Durable ownership rules between onboarding, Stripe lifecycle processing, and SINNA Core runtime authorization.
---

Onboarding owns checkout and plaintext API-key delivery. Core owns runtime authorization, stores only key hashes, and rotates keys only through authenticated tenant sync. Core must not provision or email keys from checkout webhooks.

**Why:** Generating and delivering keys from both onboarding and Core creates replay, transaction, and re-subscription races that can email credentials which are immediately revoked.

**How to apply:** Fail tenant sync closed, normalize commercial states to Core's three lifecycle states, reject identity/hash conflicts, and keep key rotation atomic. Stripe lifecycle events may update commercial state only with signature verification, durable deduplication, and monotonic event ordering.