/** REST API: guest auth, avatar persistence, office discovery, stats, voice tokens, admin. */
import os from 'node:os';
import express, { type NextFunction, type Request, type Response } from 'express';
import { matchMaker } from '@colyseus/core';
import {
  ROOM_NAME,
  SEAT_BY_ID,
  sanitizeAvatar,
  sanitizeName,
  type OfficeInfo,
  type PublicUser,
  type VoiceTokenResponse,
} from '@xbrain/shared';
import { config, voiceEnabled } from '../config';
import { issueToken, safeEqual, verifyToken } from '../services/auth';
import { KeyedWindowLimiter } from '../services/rateLimit';
import { store, type UserRecord } from '../services/store';
import { startOfDay, startOfWeek } from '../services/time';
import { createVoiceToken } from '../services/voice';
import { officeRooms } from '../rooms/OfficeRoom';

type AuthedRequest = Request & { user?: UserRecord };

const startedAt = Date.now();
let lastCpu = process.cpuUsage();
let lastCpuAt = Date.now();

const toPublic = (u: UserRecord): PublicUser => ({
  id: u.id,
  displayName: u.displayName,
  role: u.role,
  avatar: u.avatar,
  createdAt: u.createdAt.toISOString(),
});

const asyncH =
  (fn: (req: AuthedRequest, res: Response) => Promise<unknown>) => (req: AuthedRequest, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function requireUser(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const tok = verifyToken(header.startsWith('Bearer ') ? header.slice(7) : '');
  if (!tok) return res.status(401).json({ error: 'unauthorized' });
  const user = await store().getUser(tok.uid);
  if (!user) return res.status(401).json({ error: 'unknown_user' });
  if (user.banned) return res.status(403).json({ error: 'banned' });
  req.user = user;
  next();
}

/** Express middleware form of requireUser (async errors forwarded to the error handler). */
const auth = (req: Request, res: Response, next: NextFunction) => {
  requireUser(req as AuthedRequest, res, next).catch(next);
};

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!config.adminToken) return res.status(503).json({ error: 'admin_disabled', message: 'Set ADMIN_TOKEN to enable the admin API.' });
  const t = String(req.headers['x-admin-token'] ?? '');
  if (!t || !safeEqual(t, config.adminToken)) return res.status(401).json({ error: 'unauthorized' });
  next();
}

/** Ensure the office room exists and return its listing. */
export async function ensureOfficeRoom() {
  const rooms = await matchMaker.query({ name: ROOM_NAME });
  const existing = rooms.find((r) => r.metadata?.officeId === config.office.id);
  if (existing) return existing;
  const { capacity } = await store().ensureOffice(config.office.id, config.office.name, config.office.capacity);
  const listing = await matchMaker.createRoom(ROOM_NAME, { officeId: config.office.id, name: config.office.name, capacity: Math.min(capacity, config.office.capacity) });
  return listing;
}

export function createApiRouter() {
  const r = express.Router();
  const guestLimiter = new KeyedWindowLimiter(config.guestRateLimit, 60_000);

  r.get('/health', (_req, res) => res.json({ ok: true, uptime: Math.round((Date.now() - startedAt) / 1000), store: store().kind }));

  r.get('/config', (_req, res) =>
    res.json({ officeId: config.office.id, name: config.office.name, capacity: config.office.capacity, voice: { enabled: voiceEnabled(), url: config.livekit.url || undefined }, allowTeleport: config.allowTeleport, store: store().kind, serverTime: Date.now() }),
  );

  // ── Guest auth ──
  r.post(
    '/auth/guest',
    asyncH(async (req, res) => {
      if (!guestLimiter.allow(req.ip ?? 'ip')) return res.status(429).json({ error: 'rate_limited' });
      const name = sanitizeName(req.body?.displayName);
      if (name.length < 2) return res.status(400).json({ error: 'invalid_name', message: 'Display name must be 2–24 characters.' });
      const user = await store().createUser(name);
      if (req.body?.avatar) {
        await store().saveAvatar(user.id, sanitizeAvatar(req.body.avatar));
      }
      const fresh = (await store().getUser(user.id))!;
      res.status(201).json({ token: issueToken(user.id), user: toPublic(fresh) });
    }),
  );

  r.get('/me', auth, (req: AuthedRequest, res) => res.json({ user: toPublic(req.user!) }));

  r.put(
    '/me',
    auth,
    asyncH(async (req, res) => {
      const name = sanitizeName(req.body?.displayName);
      if (name.length < 2) return res.status(400).json({ error: 'invalid_name', message: 'Display name must be 2–24 characters.' });
      const u = await store().updateUser(req.user!.id, { displayName: name });
      res.json({ user: toPublic(u!) });
    }),
  );

  r.put(
    '/me/avatar',
    auth,
    asyncH(async (req, res) => {
      await store().saveAvatar(req.user!.id, sanitizeAvatar(req.body?.avatar));
      const u = await store().getUser(req.user!.id);
      res.json({ user: toPublic(u!) });
    }),
  );

  // ── Office discovery ──
  r.get(
    '/office',
    asyncH(async (_req, res) => {
      const listing = await ensureOfficeRoom();
      const room = officeRooms.get(config.office.id);
      const info: OfficeInfo = {
        officeId: config.office.id,
        name: config.office.name,
        roomId: listing?.roomId ?? null,
        online: room ? room.stats().present : listing?.clients ?? 0,
        capacity: room ? room.maxClients : config.office.capacity,
        voice: { enabled: voiceEnabled(), url: config.livekit.url || undefined },
        allowTeleport: room ? room.state.allowTeleport : config.allowTeleport,
        serverTime: Date.now(),
      };
      res.json(info);
    }),
  );

  // ── Stats ──
  r.get(
    '/stats/office',
    asyncH(async (_req, res) => {
      const room = officeRooms.get(config.office.id);
      if (!room) return res.json({ online: 0, working: 0, desksUsed: 0, capacity: config.office.capacity, desks: [] });
      const desks: Array<{ seatId: string; deskId: string; occupant: string }> = [];
      room.state.seats.forEach((sid, seatId) => {
        const seat = SEAT_BY_ID[seatId];
        if (seat?.kind === 'desk') desks.push({ seatId, deskId: seat.deskId!, occupant: room.state.players.get(sid)?.name ?? '' });
      });
      res.json({ ...room.stats(), desks });
    }),
  );

  r.get(
    '/stats/me',
    auth,
    asyncH(async (req, res) => {
      const [today, week] = await Promise.all([
        store().workTotals(req.user!.id, new Date(startOfDay())),
        store().workTotals(req.user!.id, new Date(startOfWeek())),
      ]);
      res.json({ todayMs: today.totalMs, sessionsToday: today.sessions, weekMs: week.totalMs });
    }),
  );

  // ── Voice (LiveKit SFU) ──
  r.get(
    '/voice/token',
    auth,
    asyncH(async (req, res) => {
      if (!voiceEnabled()) return res.status(503).json({ error: 'voice_not_configured', message: 'Voice server (LiveKit) is not configured on this server.' });
      const sessionId = String(req.query.sessionId ?? '');
      const room = officeRooms.get(config.office.id);
      if (!room || !room.hasSession(sessionId, req.user!.id)) return res.status(403).json({ error: 'not_in_office', message: 'Join the office before connecting voice.' });
      const token = await createVoiceToken({ officeId: config.office.id, identity: sessionId, name: req.user!.displayName, userId: req.user!.id, canPublish: !room.isMuted(sessionId) });
      const out: VoiceTokenResponse = { url: config.livekit.url, token, room: `office-${config.office.id}`, identity: sessionId };
      res.json(out);
    }),
  );

  // ── Admin ──
  const admin = express.Router();
  admin.use(requireAdmin);
  admin.get(
    '/status',
    asyncH(async (_req, res) => {
      const now = Date.now();
      const cpu = process.cpuUsage(lastCpu);
      const cpuPercent = ((cpu.user + cpu.system) / 1000 / Math.max(1, now - lastCpuAt)) * 100;
      lastCpu = process.cpuUsage();
      lastCpuAt = now;
      const mem = process.memoryUsage();
      const room = officeRooms.get(config.office.id);
      res.json({
        uptimeSec: Math.round((now - startedAt) / 1000),
        node: process.version,
        store: store().kind,
        voice: voiceEnabled(),
        cpuPercent: +cpuPercent.toFixed(1),
        memory: { rssMB: +(mem.rss / 1048576).toFixed(1), heapUsedMB: +(mem.heapUsed / 1048576).toFixed(1) },
        loadavg: os.loadavg(),
        office: room ? { ...room.stats(), allowTeleport: room.state.allowTeleport, roomId: room.roomId } : null,
        players: room ? room.listPlayers() : [],
      });
    }),
  );
  admin.get(
    '/sessions',
    asyncH(async (_req, res) => res.json({ sessions: await store().recentWorkSessions(config.office.id, 100) })),
  );
  admin.post('/kick', (req, res) => {
    const room = officeRooms.get(config.office.id);
    const ok = !!room?.kick(String(req.body?.sessionId ?? ''), sanitizeName(req.body?.reason) || 'Removed by an administrator');
    res.status(ok ? 200 : 404).json({ ok });
  });
  admin.post('/mute', (req, res) => {
    const room = officeRooms.get(config.office.id);
    const minutes = Math.max(1, Math.min(24 * 60, Number(req.body?.minutes) || 15));
    const ok = !!room?.mute(String(req.body?.sessionId ?? ''), !!req.body?.muted, minutes);
    res.status(ok ? 200 : 404).json({ ok });
  });
  admin.post(
    '/capacity',
    asyncH(async (req, res) => {
      const cap = Math.round(Number(req.body?.capacity));
      if (!Number.isFinite(cap) || cap < 1 || cap > 200) return res.status(400).json({ error: 'invalid_capacity' });
      const room = officeRooms.get(config.office.id);
      await room?.setCapacity(cap);
      res.json({ ok: true, capacity: cap });
    }),
  );
  admin.post('/teleport', (req, res) => {
    officeRooms.get(config.office.id)?.setAllowTeleport(!!req.body?.allow);
    res.json({ ok: true, allow: !!req.body?.allow });
  });
  r.use('/admin', admin);

  return r;
}
