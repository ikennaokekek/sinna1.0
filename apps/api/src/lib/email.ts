export async function sendEmailNotice(to: string, subject: string, text: string): Promise<void> {
  // Prefer Resend if available; otherwise stub-log
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.log('[EMAIL:STUB]', { to, subject, text });
    return;
  }
  // Minimal Resend REST call
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.NOTIFY_FROM_EMAIL || 'no-reply@sinna.dev',
        to: [to],
        subject,
        text
      })
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[EMAIL:FAIL]', err);
  }
}


