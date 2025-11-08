# Render notes

- Use a **Workspace plan** that fits prod (Professional is recommended). 
- Create an **Environment Group** and paste values from `render.env.template`.
- Attach the group to both services (API + Worker).
- Verify `/health` passes after deploy.
- If using Stripe webhooks, set the URL in Stripe to your public `/webhooks/stripe` endpoint and paste `STRIPE_WEBHOOK_SECRET` here.
