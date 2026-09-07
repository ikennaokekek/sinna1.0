# Security Rotation Review

This note records credential classes that appeared in tracked documentation or
test material. Values are intentionally omitted.

| Credential type | Required action | Reason |
| --- | --- | --- |
| Stripe secret/API key | VERIFY THEN ROTATE | A secret-shaped value appeared in tracked test material and history; confirm it was synthetic, then rotate if not. |
| Stripe webhook signing secret | ROTATE | A webhook-secret-shaped value appeared in tracked verification material and history. |
| Resend API key | VERIFY THEN ROTATE | A key-shaped value appeared in tracked environment documentation; confirm provider state, then rotate if it was real. |
| SendGrid API key | VERIFY THEN ROTATE | A key-shaped value appeared in tracked environment documentation; confirm provider state, then rotate if it was real. |
| Sentry DSN | VERIFY THEN ROTATE | A concrete DSN-shaped value appeared in tracked environment documentation; apply the project's operational sensitivity policy. |

Redaction from the working tree does not prove that historical credentials were
revoked. Provider dashboards and Git history require separate owner review.