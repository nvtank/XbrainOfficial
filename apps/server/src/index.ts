import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Server, type Presence } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_NAME } from '@xbrain/shared';
import { config, voiceEnabled } from './config';
import { createApiRouter, ensureOfficeRoom } from './api/routes';
import { OfficeRoom } from './rooms/OfficeRoom';
import { initStore, store } from './services/store';

async function main() {
  await initStore();
  const closed = await store().closeDanglingSessions('server_restart');
  if (closed) console.log(`[store] closed ${closed} dangling work session(s) from a previous run`);

  const app = express();
  app.set('trust proxy', true);
  app.use(cors({ origin: config.corsOrigin.includes('*') ? true : config.corsOrigin }));
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', createApiRouter());

  if (config.serveWebDir && fs.existsSync(config.serveWebDir)) {
    const dir = path.resolve(config.serveWebDir);
    app.use(express.static(dir, { maxAge: '1h', index: false }));
    app.get(/^(?!\/api|\/matchmake).*/, (_req, res) => res.sendFile(path.join(dir, 'index.html')));
    console.log(`[http] serving web client from ${dir}`);
  }

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[http] error', err);
    res.status(500).json({ error: 'internal_error' });
  });

  const server = http.createServer(app);

  // Optional horizontal scaling: Redis presence + driver (multiple Node processes behind a LB).
  let presence: Presence | undefined;
  let driver: unknown;
  if (config.redisUrl) {
    const { RedisPresence } = await import('@colyseus/redis-presence');
    const { RedisDriver } = await import('@colyseus/redis-driver');
    presence = new RedisPresence(config.redisUrl as never);
    driver = new RedisDriver(config.redisUrl as never);
    console.log('[colyseus] using Redis presence/driver');
  }

  const gameServer = new Server({
    transport: new WebSocketTransport({ server, maxPayload: 16 * 1024, pingInterval: 4000, pingMaxRetries: 3 }),
    presence,
    driver: driver as never,
  });
  gameServer.define(ROOM_NAME, OfficeRoom);

  await gameServer.listen(config.port, config.host);
  await ensureOfficeRoom();
  console.log(`\n  XBrain Virtual Office server → http://localhost:${config.port}`);
  console.log(`  store: ${store().kind} · voice: ${voiceEnabled() ? 'LiveKit ' + config.livekit.url : 'disabled (LIVEKIT_* not set)'} · admin: ${config.adminToken ? 'enabled' : 'disabled'}\n`);

  const shutdown = async (sig: string) => {
    console.log(`[server] ${sig} received, shutting down…`);
    try {
      await gameServer.gracefullyShutdown(false);
    } catch (e) {
      console.error(e);
    }
    await store().close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((e) => {
  console.error('[server] fatal', e);
  process.exit(1);
});
