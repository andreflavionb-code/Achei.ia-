import nodemailer from "nodemailer";

/**
 * Envio de e-mail via SMTP (funciona com Gmail usando "senha de app",
 * com Brevo, Resend SMTP, Mailgun etc.).
 *
 * Sem SMTP configurado, o e-mail é apenas impresso no console. Isso permite
 * testar os alertas localmente sem conta de e-mail.
 */

interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT ?? 587);
  return { host, port, user, pass, secure: port === 465 };
}

export function isEmailConfigured(): boolean {
  return getSmtpConfig() !== null;
}

export async function sendEmail(mail: Mail): Promise<{ delivered: boolean }> {
  const config = getSmtpConfig();
  const from = process.env.EMAIL_FROM?.trim() || config?.user || "achei@localhost";

  if (!config) {
    console.log("\n[email] SMTP não configurado. E-mail que seria enviado:");
    console.log(`  Para: ${mail.to}\n  Assunto: ${mail.subject}\n${mail.text}\n`);
    return { delivered: false };
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });

  await transporter.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
  return { delivered: true };
}
