# sinna-ops (drop-in ops folder)

Use this to finish setup and deploy fast, without pasting secrets in chat.

## Quick start
1) **Copy** this folder into the **repo root**.
2) Duplicate `env.example` → `.env.local` and **fill your secrets**.
3) Seed locally:
```bash
bash scripts/export_env.sh
bash scripts/seed.sh
```
4) Run locally:
```bash
bash scripts/dev_api.sh
bash scripts/dev_worker.sh
# then visit http://localhost:3000/health and /api-docs
```
5) Deploy on Render:
   - Create an **Environment Group** and paste values from `render.env.template` (fill with your real secrets).
   - Connect repo → Apply Blueprint (your `render.yaml`) → attach the env group to **API** and **Worker** services.
   - Wait for green. `/health` must pass.

6) Smoke test prod:
```bash
# requires API_BASE and API_KEY in .env.local
bash scripts/smoke.sh
```

## Files
- `env.example` → template of required/optional envs.
- `render.env.template` → copy into a Render Environment Group.
- `scripts/export_env.sh` → exports `.env.local` into the shell.
- `scripts/seed.sh` → builds API and runs DB seed.
- `scripts/dev_api.sh`, `scripts/dev_worker.sh` → local dev runners.
- `scripts/smoke.sh` → hits /health, /api-docs, creates a job, polls it.
- `.github/workflows/ci.yml` → minimal CI gates (lint/type/test/build).

## Notes
- Keep `CORS_ORIGINS` tight to your domains.
- Rotate any keys that were ever committed before.
- Track the low-severity `fast-redact` advisory and update fastify/pino when patched.
