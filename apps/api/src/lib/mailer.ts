import nodemailer from 'nodemailer';
import type { Env } from '../env.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Envía por SMTP. En desarrollo apunta a Mailpit (localhost:1025, interfaz en :8025). */
export function createSmtpMailer(env: Env): Mailer {
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    ...(env.SMTP_USER && env.SMTP_PASS
      ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }
      : {}),
  });
  return {
    async send(message) {
      await transport.sendMail({ from: env.MAIL_FROM, ...message });
    },
  };
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Correo transaccional mínimo: un párrafo y un enlace de acción. */
export function actionEmail(params: {
  to: string;
  subject: string;
  intro: string;
  actionLabel: string;
  url: string;
}): MailMessage {
  const { to, subject, intro, actionLabel, url } = params;
  return {
    to,
    subject,
    text: `${intro}\n\n${actionLabel}: ${url}\n`,
    html: `<p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(actionLabel)}</a></p>`,
  };
}
