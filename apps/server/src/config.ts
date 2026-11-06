import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { DEFAULT_OFFICE_ID, DEFAULT_OFFICE_NAME, OFFICE_CAPACITY } from '@xbrain/shared';

const here = path.dirname(fileURLToPath(import.meta.url));
// Repo-root .env (works for src/ in dev and dist/ in production — both are 3 levels deep).
dotenv.config({ path: path.resolve(here, '../../../.env') });
dotenv.config();

const bool = (v: string | undefined, def = false) => (v === undefined || v === '' ? def : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()));
const num = (v: string | undefined, def: number) => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : def;
};

const DEV_SECRET = 'dev-insecure-secret-change-me';

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  // SERVER_PORT wins; PORT (PaaS convention) is honoured only in production so dev tools that inject PORT don't clash with Vite.
  port: num(process.env.SERVER_PORT, process.env.NODE_ENV === 'production' ? num(process.env.PORT, 2567) : 2567),
  host: process.env.HOST ?? '0.0.0.0',
  corsOrigin: (process.env.CORS_ORIGIN ?? '*').split(',').map((s) => s.trim()).filter(Boolean),
  databaseUrl: process.env.DATABASE_URL ?? '',
  strictDb: bool(process.env.STRICT_DB, false),
  memoryStoreFile: process.env.MEMORY_STORE_FILE ?? path.resolve(here, '../data/dev-db.json'),
  redisUrl: process.env.REDIS_URL ?? '',
  authSecret: process.env.AUTH_SECRET || DEV_SECRET,
  adminToken: process.env.ADMIN_TOKEN ?? '',
  livekit: {
    url: process.env.LIVEKIT_URL ?? '',
    host: process.env.LIVEKIT_HOST ?? (process.env.LIVEKIT_URL ?? '').replace(/^ws/, 'http'),
    apiKey: process.env.LIVEKIT_API_KEY ?? '',
    apiSecret: process.env.LIVEKIT_API_SECRET ?? '',
  },
  office: {
    id: process.env.OFFICE_ID ?? DEFAULT_OFFICE_ID,
    name: process.env.OFFICE_NAME ?? DEFAULT_OFFICE_NAME,
    capacity: Math.max(1, Math.min(200, num(process.env.OFFICE_CAPACITY, OFFICE_CAPACITY))),
  },
  allowTeleport: bool(process.env.ALLOW_TELEPORT, false),
  chatPersist: bool(process.env.CHAT_PERSIST, false),
  /** 'stop' ends the work session on stand-up; 'pause' keeps today's timer and resumes on the next sit. */
  workStandMode: (process.env.WORK_STAND_MODE === 'pause' ? 'pause' : 'stop') as 'stop' | 'pause',
  /** Office timezone offset for "today" statistics (minutes). Asia/Ho_Chi_Minh = +420. */
  tzOffsetMinutes: num(process.env.TZ_OFFSET_MINUTES, 420),
  serveWebDir: process.env.SERVE_WEB ?? '',
  /** Guest account creations per IP per minute (raise for single-machine load tests). */
  guestRateLimit: num(process.env.GUEST_RATE_LIMIT, 15),
  /** Max messages/second per client before disconnect (anti-flood). */
  floodLimit: num(process.env.FLOOD_LIMIT, 80),
};

export const voiceEnabled = () => !!(config.livekit.url && config.livekit.apiKey && config.livekit.apiSecret);

if (config.authSecret === DEV_SECRET && config.env === 'production') {
  console.warn('[config] AUTH_SECRET is not set — using an insecure development secret!');
}
