# Service Status

This document tracks operational status and incident history.

- Status Page: Set via `X-Status-Page` header (defaults to https://status.sinna.dev)
- Health: `/health`
- Metrics: `/metrics` (Prometheus)
- Alerts (recommended):
  - DLQ spike: alert when `<queue>-dlq` grows > 10/min
  - 5xx rate: alert when 5xx > 1% over 5m
  - P95 latency: alert when P95 > SLA (2h for 60min inputs)

## Incident Log

- No incidents recorded.
