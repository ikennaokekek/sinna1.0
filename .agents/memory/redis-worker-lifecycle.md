---
name: Redis worker lifecycle
description: Non-obvious ioredis and BullMQ startup and shutdown constraints for always-on workers.
---

Bound the initial Redis connect and ping independently from the long-lived
runtime reconnection policy. During shutdown, drain and close BullMQ workers,
events, and queues before closing their shared base Redis connection.

**Why:** BullMQ requires blocking clients to allow unbounded command retries,
which can otherwise leave initial startup pending forever. Closing a shared
connection concurrently with BullMQ handles can also produce EPIPE and
closed-connection failures during termination.

**How to apply:** Keep production startup deadline-bounded and fatal even when
runtime reconnects are intentionally persistent. Preserve dependency-first
shutdown ordering whenever queue consumers or producers are added.