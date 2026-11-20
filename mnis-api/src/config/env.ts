import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32).optional(),
  RX_SIGNING_KEY: z.string().min(32),
  BLIND_INDEX_KEY: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(40),
  ACCESS_TTL_SECONDS: z.coerce.number().default(900),
  REFRESH_TTL_DAYS: z.coerce.number().default(7),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  SWAGGER_ENABLED: z.string().default('false'),
  // Number of reverse proxies in front of the API (Render = 1; Render behind Vercel rewrites = 2)
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast at boot with the names of the bad variables (never the values).
  const bad = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
  throw new Error(`Invalid or missing environment variables: ${bad}`);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
