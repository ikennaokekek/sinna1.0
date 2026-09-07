# Current email diagnostic guidance

Core notification email is independent of checkout provisioning. A completed
checkout does not create a tenant, issue an API key, or email an API key from
Core. Diagnose customer onboarding email in the onboarding service.

To verify Core notification email, run
`pnpm tsx scripts/diagnose-email-issue.ts <TEST_RECIPIENT_EMAIL>` with either
`RESEND_API_KEY` or `SENDGRID_API_KEY` and a valid `NOTIFY_FROM_EMAIL`. Verify
provider delivery in the provider’s dashboard without exposing credentials or
API keys in logs.