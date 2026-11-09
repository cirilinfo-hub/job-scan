import nodemailer from 'nodemailer';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

export interface Mail { to: string; subject: string; text: string }

const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    })
  : null;

export const isEmailConfigured = () => !!transport;

/** Sends through SMTP. Without SMTP outside production the message goes to the log, so local flows can be completed. */
export async function sendMail(mail: Mail): Promise<boolean> {
  if (!transport) {
    if (!env.isProd) logger.info({ mailTo: mail.to, subject: mail.subject, text: mail.text }, 'Email not sent: SMTP is not configured');
    else logger.warn({ subject: mail.subject }, 'Email not sent: SMTP is not configured');
    return false;
  }
  try {
    await transport.sendMail({ from: env.SMTP_FROM, ...mail });
    return true;
  } catch (err) {
    logger.error({ err, subject: mail.subject }, 'Email send failed');
    return false;
  }
}
