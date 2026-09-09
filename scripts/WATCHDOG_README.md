# Archived legacy Render watchdog

This document previously described a Render log-polling and auto-healing
deployment. That topology is not part of the current SINNA Core architecture and
must not be deployed or enabled.

The supported deployment boundary is documented in
`docs/CORE_INFRASTRUCTURE_STEP6.md`: Core API runs in its own Replit Autoscale
context and the worker runs in a separate Replit Reserved VM context from the
same approved revision.

Use Replit deployment logs, the API health/readiness endpoints, the trusted
worker readiness command, queue failure/stall events, and the repository
validation commands for current operations. The legacy watchdog source remains
historical only and is not an approved deployment unit.