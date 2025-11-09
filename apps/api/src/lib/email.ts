// Simple logger interface for email service
const logger = {
  debug: (msg: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[EMAIL:DEBUG] ${msg}`, data || '');
    }
  },
  info: (msg: string, data?: any) => {
    console.log(`[EMAIL:INFO] ${msg}`, data || '');
  },
  warn: (msg: string, data?: any) => {
    console.warn(`[EMAIL:WARN] ${msg}`, data || '');
  },
  error: (msg: string, data?: any) => {
    console.error(`[EMAIL:ERROR] ${msg}`, data || '');
  }
};

export async function sendEmailNotice(to: string, subject: string, text: string): Promise<void> {
  const fromEmail = process.env.NOTIFY_FROM_EMAIL || 'noreply@sinna.site';
  
  logger.debug('Email service check', {
    resendKey: process.env.RESEND_API_KEY ? 'present' : 'missing',
    sendgridKey: process.env.SENDGRID_API_KEY ? 'present' : 'missing',
    fromEmail,
    to,
    subject
  });
  
  // Try Resend first
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      logger.info('Attempting to send via Resend', { to, subject });
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [to],
          subject,
          text
        })
      });
      
      if (response.ok) {
        logger.info('Email sent successfully via Resend', { to, subject, status: response.status });
        return;
      } else {
        const errorText = await response.text().catch(() => '');
        logger.warn('Resend API returned error', { status: response.status, statusText: response.statusText, error: errorText });
      }
    } catch (err) {
      logger.error('Resend API request failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Fallback to SendGrid
  const sendgridKey = process.env.SENDGRID_API_KEY;
  if (sendgridKey) {
    try {
      logger.info('Attempting to send via SendGrid', { to, subject });
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sendgridKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: fromEmail },
          subject,
          content: [{ type: 'text/plain', value: text }]
        })
      });
      
      if (response.ok) {
        logger.info('Email sent successfully via SendGrid', { to, subject, status: response.status });
        return;
      } else {
        const errorText = await response.text().catch(() => '');
        logger.warn('SendGrid API returned error', { status: response.status, statusText: response.statusText, error: errorText });
      }
      } catch (err) {
      logger.error('SendGrid API request failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // If both fail, throw error so caller knows email failed
  const errorMessage = 'No email service configured or all services failed';
  logger.error(errorMessage, { 
    to, 
    subject, 
    fromEmail,
    resendConfigured: !!resendKey,
    sendgridConfigured: !!sendgridKey,
    reason: !resendKey && !sendgridKey ? 'No email service configured' : 'All email services failed'
  });
  throw new Error(`${errorMessage}. Resend: ${resendKey ? 'configured' : 'missing'}, SendGrid: ${sendgridKey ? 'configured' : 'missing'}`);
}


