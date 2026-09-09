# Replit sync configuration — rotation required

This historical repository document previously contained a literal
`REPLIT_SYNC_SECRET`. It has been mechanically redacted as
`<ROTATE_EXPOSED_REPLIT_SYNC_SECRET>` and must be rotated in every affected
environment before production use. Repository exposure requires rotation; this
change does not rotate or alter live state.

Configure the shared secret only in encrypted service configuration. Onboarding
uses it to call Core's authenticated `POST /v1/sync/tenant`; Core never logs,
returns, or stores the plaintext secret. The onboarding service alone owns
checkout and plaintext API-key delivery.