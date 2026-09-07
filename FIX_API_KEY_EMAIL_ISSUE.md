# API-key delivery architecture

There is no Core-side checkout switch or fallback that provisions a tenant or
sends an API key. `checkout.session.completed` is signature-verified and
acknowledged only. The onboarding service owns tenant creation, API-key
issuance, and customer delivery, then sends the resulting tenant and hashed key
to `POST /v1/sync/tenant`.

If a customer has not received an API key, investigate the onboarding service’s
provisioning and email delivery. Confirm its sync request is accepted by Core
using `REPLIT_SYNC_SECRET`; do not attempt to recover plaintext keys from Core
logs or replay a checkout webhook to provision an account.