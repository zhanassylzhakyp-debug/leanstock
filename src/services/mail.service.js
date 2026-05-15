const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../config/logger');

let transporter;

const getTransporter = () => {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth:
      env.SMTP_USER && env.SMTP_PASS
        ? {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
          }
        : undefined,
  });
  return transporter;
};

const smtpConfigured = () =>
  Boolean(env.SMTP_HOST && String(env.SMTP_HOST).trim() && env.SMTP_USER && env.SMTP_PASS);

const sendMail = async ({ to, subject, text, html }) => {
  if (env.DISABLE_EMAIL_SEND === 'true') {
    logger.info('[mail] DISABLE_EMAIL_SEND=true — skipping SMTP', { to, subject });
    return { skipped: true };
  }
  if (env.NODE_ENV === 'development' && !smtpConfigured()) {
    logger.info('[mail] development without SMTP — skipping send', { to, subject });
    return { skipped: true };
  }
  const t = getTransporter();
  const info = await t.sendMail({
    from: env.SMTP_FROM,
    to,
    subject,
    text,
    html: html || text,
  });
  logger.info('[mail] sent', { to, subject, messageId: info.messageId });
  return info;
};

module.exports = { sendMail };
