# Usage Caps

These caps ensure fair use and predictable performance per tenant.

## Per Job
- Maximum input duration: 60 minutes (1 hour)

## Per Tenant (Daily)
- Maximum jobs per day: 10

## Notes
- Caps are enforced by paywall middleware and job scheduler
- Requests exceeding caps return 429 with code `USAGE_LIMIT_EXCEEDED`
