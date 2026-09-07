---
name: Replit package-firewall toolchain
description: Durable guidance for resolving blocked JavaScript transitive dependencies in SINNA without bypasses.
---

Prefer upgrading the supported direct parent dependency over pnpm overrides when Replit Package Firewall blocks a vulnerable transitive package. Keep Vitest, its Vite peer, and tsx mutually compatible with the configured Node runtime.

**Why:** The firewall blocked an older AWS transitive XML parser and older Vitest releases. Upgrading AWS removed the parser naturally; the first allowed Vitest major exposed peer and constructor-mock compatibility requirements.

**How to apply:** Check engine ranges and firewall availability before choosing versions, regenerate the lockfile normally, resolve peer warnings rather than accepting them, and update constructor test doubles to use constructible functions or classes.