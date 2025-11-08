# LAUNCH_CHECKLIST.md

- [ ] Postgres provisioned and `DATABASE_URL` set
- [ ] Redis provisioned and `REDIS_URL` set
- [ ] Cloudflare R2: bucket + keys set
- [ ] `.env.local` filled and **never committed**
- [ ] `bash scripts/export_env.sh` ran OK
- [ ] `bash scripts/seed.sh` OK
- [ ] Local `/health` and `/api-docs` OK
- [ ] Render environment group created
- [ ] Render services attached to env group and deployed
- [ ] Prod `/health` OK
- [ ] `bash scripts/smoke.sh` OK (job flows end-to-end)
- [ ] Sentry DSN configured and a test error captured
- [ ] UptimeRobot pointed at `/health`
- [ ] Keys rotated if they ever lived in files
