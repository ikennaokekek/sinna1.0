#!/usr/bin/env tsx
/**
 * Verify outbound notification-email configuration. Checkout provisioning and
 * API-key delivery belong to the onboarding service, not SINNA Core.
 */
import { sendEmailNotice } from '../apps/api/src/lib/email';

async function main(): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  const sendgridKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.NOTIFY_FROM_EMAIL || 'noreply@sinna.site';
  const testEmail = process.argv[2];

  console.log(`RESEND_API_KEY: ${resendKey ? 'set' : 'missing'}`);
  console.log(`SENDGRID_API_KEY: ${sendgridKey ? 'set' : 'missing'}`);
  console.log(`NOTIFY_FROM_EMAIL: ${fromEmail}`);
  console.log('Core checkout webhooks do not provision tenants or send API keys.');

  if (!resendKey && !sendgridKey) {
    throw new Error('Configure RESEND_API_KEY or SENDGRID_API_KEY before sending a test notice.');
  }
  if (!testEmail) {
    console.log('Configuration check complete. Supply a recipient argument to send a test notice.');
    return;
  }

  await sendEmailNotice(
    testEmail,
    'SINNA Core notification-email test',
    'This verifies the Core notification email provider configuration.',
  );
  console.log('Test notification submitted.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});