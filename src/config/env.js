require('dotenv').config();
const { z } = require('zod');

const envSchema = z
  .object({
    PORT: z.string().default('3000'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
    JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
    APP_PUBLIC_URL: z.string().url().default('http://localhost:3000'),
    QUEUE_PREFIX: z.string().default('leanstock'),
    SKIP_EMAIL_VERIFICATION: z.string().optional(),
    ENABLE_TEST_QUEUES: z.string().optional(),
    DISABLE_EMAIL_SEND: z.string().optional().default('false'),
    SMTP_HOST: z.string().optional().default(''),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_USER: z.string().optional().default(''),
    SMTP_PASS: z.string().optional().default(''),
    SMTP_FROM: z.string().min(1).default('LeanStock <noreply@localhost>'),
    SMTP_SECURE: z.string().optional().default('false'),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'test') return;
    if (data.DISABLE_EMAIL_SEND === 'true') return;
    // В development можно поднять API без SMTP — письма просто не уйдут (см. mail.service).
    if (data.NODE_ENV === 'development') return;
    if (!data.SMTP_HOST || !data.SMTP_USER || !data.SMTP_PASS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'В production задайте SMTP_HOST, SMTP_USER, SMTP_PASS или DISABLE_EMAIL_SEND=true',
        path: ['SMTP_HOST'],
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  parsed.error.issues.forEach((issue) => {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

const data = parsed.data;

if (
  data.NODE_ENV === 'development' &&
  data.DISABLE_EMAIL_SEND !== 'true' &&
  (!data.SMTP_HOST || !data.SMTP_USER || !data.SMTP_PASS)
) {
  console.warn(
    '⚠️  SMTP не задан — в development письма не отправляются (API и worker стартуют). Для реальной почты добавьте SMTP_* или DISABLE_EMAIL_SEND=true.'
  );
}

module.exports = {
  ...data,
  SMTP_SECURE: data.SMTP_SECURE === 'true',
};
