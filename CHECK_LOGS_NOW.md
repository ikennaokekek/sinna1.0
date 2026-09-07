# Current webhook and notification checks

Use your hosting provider’s log viewer to confirm that a payment webhook reaches
`/webhooks/stripe` and passes signature verification. A completed checkout is
authenticated and acknowledged by Core only; onboarding provisions the tenant,
issues any API key, sends customer email, and then calls `/v1/sync/tenant`.

For Core notification delivery, check whether `RESEND_API_KEY` or
`SENDGRID_API_KEY` is configured and whether `NOTIFY_FROM_EMAIL` is valid. Do
not search logs for API keys or expect checkout completion to send one.