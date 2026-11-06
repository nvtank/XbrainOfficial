/**
 * Persistence layer. PostgreSQL via Prisma in production; an in-memory store
 * (persisted to a JSON file) is used automatically when DATABASE_URL is not set,
 * so the project runs locally without Docker.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { sanitizeAvatar, type AvatarConfig } from '@xbrain/shared';
import { config } from '../config';

export interface UserRecord {
  id: string;
  displayName: string;
  role: 'member' | 'admin';
  banned: boolean;
  createdAt: Date;
  avatar: AvatarConfig | null;
}

export interface WorkSessionRecord {
  id: string;
  userId: string;
  officeId: string;
  deskId: string;
  startedAt: Date;
  endedAt: Date | null;
  activeMs: number;
  endReason: string | null;
}

export interface WorkTotals {
  totalMs: number;
  sessions: number;
}

export interface Store {
  readonly kind: 'postgres' | 'memory';
  init(): Promise<void>;
  close(): Promise<void>;
  createUser(displayName: string): Promise<UserRecord>;
  getUser(id: string): Promise<UserRecord | null>;
  updateUser(id: string, data: { displayName?: string }): Promise<UserRecord | null>;
  touchUser(id: string): Promise<void>;
  saveAvatar(userId: string, avatar: AvatarConfig): Promise<void>;
  ensureOffice(id: string, name: string, capacity: number): Promise<{ capacity: number }>;
  setOfficeCapacity(id: string, capacity: number): Promise<void>;
  startWorkSession(data: { userId: string; officeId: string; deskId: string; startedAt: Date }): Promise<string>;
  updateWorkSession(id: string, data: { activeMs: number; endedAt?: Date; endReason?: string }): Promise<void>;
  /** Sum of work time for sessions started since `since`. closedOnly excludes running sessions. */
  workTotals(userId: string, since: Date, closedOnly?: boolean): Promise<WorkTotals>;
  recentWorkSessions(officeId: string, limit: number): Promise<Array<WorkSessionRecord & { displayName: string }>>;
  closeDanglingSessions(reason: string): Promise<number>;
  saveChat(data: { officeId: string; channel: string; senderId: string; recipientId?: string; text: string }): Promise<void>;
  addModeration(data: { userId: string; action: string; reason?: string; expiresAt?: Date }): Promise<void>;
  /** Idempotent daily check-in. Returns the stored record (already=true if it existed). */
  checkIn(data: { userId: string; officeId: string; day: string; at: Date; late: boolean }): Promise<{ at: Date; late: boolean; already: boolean }>;
  attendanceForDay(officeId: string, day: string): Promise<AttendanceRecord[]>;
  activeUsersSince(since: Date): Promise<number>;
}

export interface AttendanceRecord {
  userId: string;
  displayName: string;
  at: Date;
  late: boolean;
}

// ───────────────────────────── Memory store ─────────────────────────────
interface MemoryData {
  users: Record<string, Omit<UserRecord, 'createdAt' | 'avatar'> & { createdAt: string; lastSeenAt?: string }>;
  avatars: Record<string, AvatarConfig>;
  offices: Record<string, { id: string; name: string; capacity: number }>;
  sessions: Record<string, Omit<WorkSessionRecord, 'startedAt' | 'endedAt'> & { startedAt: string; endedAt: string | null }>;
  chats: Array<{ officeId: string; channel: string; senderId: string; recipientId?: string; text: string; createdAt: string }>;
  moderation: Array<{ userId: string; action: string; reason?: string; createdAt: string; expiresAt?: string }>;
  attendance: Record<string, { userId: string; officeId: string; day: string; at: string; late: boolean }>;
}

const cuid = () => 'c' + crypto.randomBytes(12).toString('hex');

export class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  private data: MemoryData = { users: {}, avatars: {}, offices: {}, sessions: {}, chats: [], moderation: [], attendance: {} };
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(private readonly file: string) {}

  async init() {
    try {
      if (fs.existsSync(this.file)) {
        this.data = { ...this.data, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
      }
    } catch (e) {
      console.warn('[store] could not read memory store file, starting empty', e);
    }
  }

  async close() {
    this.flush();
  }

  private scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.flush(), 1500);
  }

  private flush() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      if (this.data.chats.length > 5000) this.data.chats = this.data.chats.slice(-5000);
      fs.writeFileSync(this.file, JSON.stringify(this.data));
    } catch (e) {
      console.warn('[store] failed to persist memory store', e);
    }
  }

  private toUser(id: string): UserRecord | null {
    const u = this.data.users[id];
    if (!u) return null;
    return { id: u.id, displayName: u.displayName, role: u.role, banned: u.banned, createdAt: new Date(u.createdAt), avatar: this.data.avatars[id] ?? null };
  }

  async createUser(displayName: string) {
    const id = cuid();
    this.data.users[id] = { id, displayName, role: 'member', banned: false, createdAt: new Date().toISOString() };
    this.scheduleSave();
    return this.toUser(id)!;
  }

  async getUser(id: string) {
    return this.toUser(id);
  }

  async updateUser(id: string, data: { displayName?: string }) {
    const u = this.data.users[id];
    if (!u) return null;
    if (data.displayName) u.displayName = data.displayName;
    this.scheduleSave();
    return this.toUser(id);
  }

  async touchUser(id: string) {
    const u = this.data.users[id];
    if (u) {
      u.lastSeenAt = new Date().toISOString();
      this.scheduleSave();
    }
  }

  async saveAvatar(userId: string, avatar: AvatarConfig) {
    this.data.avatars[userId] = avatar;
    this.scheduleSave();
  }

  async ensureOffice(id: string, name: string, capacity: number) {
    const o = (this.data.offices[id] ??= { id, name, capacity });
    o.name = name;
    this.scheduleSave();
    return { capacity: o.capacity };
  }

  async setOfficeCapacity(id: string, capacity: number) {
    if (this.data.offices[id]) this.data.offices[id].capacity = capacity;
    this.scheduleSave();
  }

  async startWorkSession(d: { userId: string; officeId: string; deskId: string; startedAt: Date }) {
    const id = cuid();
    this.data.sessions[id] = { id, userId: d.userId, officeId: d.officeId, deskId: d.deskId, startedAt: d.startedAt.toISOString(), endedAt: null, activeMs: 0, endReason: null };
    this.scheduleSave();
    return id;
  }

  async updateWorkSession(id: string, d: { activeMs: number; endedAt?: Date; endReason?: string }) {
    const s = this.data.sessions[id];
    if (!s) return;
    s.activeMs = Math.max(0, Math.round(d.activeMs));
    if (d.endedAt) s.endedAt = d.endedAt.toISOString();
    if (d.endReason) s.endReason = d.endReason;
    this.scheduleSave();
  }

  async workTotals(userId: string, since: Date, closedOnly = false) {
    let totalMs = 0;
    let sessions = 0;
    for (const s of Object.values(this.data.sessions)) {
      if (s.userId === userId && new Date(s.startedAt) >= since && (!closedOnly || s.endedAt)) {
        totalMs += s.activeMs;
        sessions++;
      }
    }
    return { totalMs, sessions };
  }

  async recentWorkSessions(officeId: string, limit: number) {
    return Object.values(this.data.sessions)
      .filter((s) => s.officeId === officeId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit)
      .map((s) => ({
        ...s,
        startedAt: new Date(s.startedAt),
        endedAt: s.endedAt ? new Date(s.endedAt) : null,
        displayName: this.data.users[s.userId]?.displayName ?? '?',
      }));
  }

  async closeDanglingSessions(reason: string) {
    let n = 0;
    for (const s of Object.values(this.data.sessions)) {
      if (!s.endedAt) {
        s.endedAt = new Date().toISOString();
        s.endReason = reason;
        n++;
      }
    }
    if (n) this.scheduleSave();
    return n;
  }

  async saveChat(d: { officeId: string; channel: string; senderId: string; recipientId?: string; text: string }) {
    this.data.chats.push({ ...d, createdAt: new Date().toISOString() });
    this.scheduleSave();
  }

  async addModeration(d: { userId: string; action: string; reason?: string; expiresAt?: Date }) {
    this.data.moderation.push({ ...d, expiresAt: d.expiresAt?.toISOString(), createdAt: new Date().toISOString() });
    this.scheduleSave();
  }

  async checkIn(d: { userId: string; officeId: string; day: string; at: Date; late: boolean }) {
    this.data.attendance ??= {};
    const key = `${d.userId}|${d.officeId}|${d.day}`;
    const hit = this.data.attendance[key];
    if (hit) return { at: new Date(hit.at), late: hit.late, already: true };
    this.data.attendance[key] = { userId: d.userId, officeId: d.officeId, day: d.day, at: d.at.toISOString(), late: d.late };
    this.scheduleSave();
    return { at: d.at, late: d.late, already: false };
  }

  async attendanceForDay(officeId: string, day: string) {
    return Object.values(this.data.attendance ?? {})
      .filter((a) => a.officeId === officeId && a.day === day)
      .map((a) => ({ userId: a.userId, displayName: this.data.users[a.userId]?.displayName ?? '?', at: new Date(a.at), late: a.late }));
  }

  async activeUsersSince(since: Date) {
    return Object.values(this.data.users).filter((u) => u.lastSeenAt && new Date(u.lastSeenAt) >= since).length;
  }
}

// ───────────────────────────── Prisma / PostgreSQL store ─────────────────────────────
// Typed loosely so the server still compiles before `prisma generate` has been run.
type AnyPrisma = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export class PrismaStore implements Store {
  readonly kind = 'postgres' as const;
  private prisma!: AnyPrisma;

  async init() {
    const mod: AnyPrisma = await import('@prisma/client');
    const PrismaClient = mod.PrismaClient ?? mod.default?.PrismaClient;
    this.prisma = new PrismaClient();
    await this.prisma.$connect();
    await this.prisma.$queryRaw`SELECT 1`;
  }

  async close() {
    await this.prisma?.$disconnect();
  }

  private toUser(u: AnyPrisma): UserRecord | null {
    if (!u) return null;
    return {
      id: u.id,
      displayName: u.displayName,
      role: u.role === 'admin' ? 'admin' : 'member',
      banned: u.banned,
      createdAt: u.createdAt,
      avatar: u.avatar ? sanitizeAvatar(u.avatar.config) : null,
    };
  }

  async createUser(displayName: string) {
    return this.toUser(await this.prisma.user.create({ data: { displayName }, include: { avatar: true } }))!;
  }

  async getUser(id: string) {
    return this.toUser(await this.prisma.user.findUnique({ where: { id }, include: { avatar: true } }));
  }

  async updateUser(id: string, data: { displayName?: string }) {
    try {
      return this.toUser(await this.prisma.user.update({ where: { id }, data, include: { avatar: true } }));
    } catch {
      return null;
    }
  }

  async touchUser(id: string) {
    await this.prisma.user.update({ where: { id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }

  async saveAvatar(userId: string, avatar: AvatarConfig) {
    await this.prisma.avatarConfig.upsert({ where: { userId }, create: { userId, config: avatar }, update: { config: avatar } });
  }

  async ensureOffice(id: string, name: string, capacity: number) {
    const o = await this.prisma.officeInstance.upsert({ where: { id }, create: { id, name, capacity }, update: { name } });
    return { capacity: o.capacity };
  }

  async setOfficeCapacity(id: string, capacity: number) {
    await this.prisma.officeInstance.update({ where: { id }, data: { capacity } });
  }

  async startWorkSession(d: { userId: string; officeId: string; deskId: string; startedAt: Date }) {
    const s = await this.prisma.workSession.create({ data: d });
    return s.id as string;
  }

  async updateWorkSession(id: string, d: { activeMs: number; endedAt?: Date; endReason?: string }) {
    await this.prisma.workSession.update({ where: { id }, data: { activeMs: Math.max(0, Math.round(d.activeMs)), endedAt: d.endedAt, endReason: d.endReason } });
  }

  async workTotals(userId: string, since: Date, closedOnly = false) {
    const where: AnyPrisma = { userId, startedAt: { gte: since } };
    if (closedOnly) where.endedAt = { not: null };
    const r = await this.prisma.workSession.aggregate({ where, _sum: { activeMs: true }, _count: true });
    return { totalMs: r._sum.activeMs ?? 0, sessions: r._count ?? 0 };
  }

  async recentWorkSessions(officeId: string, limit: number) {
    const rows = await this.prisma.workSession.findMany({
      where: { officeId },
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: { user: { select: { displayName: true } } },
    });
    return rows.map((r: AnyPrisma) => ({ ...r, displayName: r.user.displayName }));
  }

  async closeDanglingSessions(reason: string) {
    const r = await this.prisma.workSession.updateMany({ where: { endedAt: null }, data: { endedAt: new Date(), endReason: reason } });
    return r.count as number;
  }

  async saveChat(d: { officeId: string; channel: string; senderId: string; recipientId?: string; text: string }) {
    await this.prisma.chatMessage.create({ data: d });
  }

  async addModeration(d: { userId: string; action: string; reason?: string; expiresAt?: Date }) {
    await this.prisma.moderationAction.create({ data: d });
  }

  async checkIn(d: { userId: string; officeId: string; day: string; at: Date; late: boolean }) {
    const where = { userId_officeId_day: { userId: d.userId, officeId: d.officeId, day: d.day } };
    const hit = await this.prisma.attendance.findUnique({ where });
    if (hit) return { at: hit.checkedInAt as Date, late: hit.late as boolean, already: true };
    try {
      await this.prisma.attendance.create({ data: { userId: d.userId, officeId: d.officeId, day: d.day, checkedInAt: d.at, late: d.late } });
      return { at: d.at, late: d.late, already: false };
    } catch {
      // Unique race: another request created it first.
      const again = await this.prisma.attendance.findUnique({ where });
      return { at: again.checkedInAt as Date, late: again.late as boolean, already: true };
    }
  }

  async attendanceForDay(officeId: string, day: string) {
    const rows = await this.prisma.attendance.findMany({ where: { officeId, day }, include: { user: { select: { displayName: true } } }, orderBy: { checkedInAt: 'asc' } });
    return rows.map((r: AnyPrisma) => ({ userId: r.userId, displayName: r.user.displayName, at: r.checkedInAt, late: r.late }));
  }

  async activeUsersSince(since: Date) {
    return (await this.prisma.user.count({ where: { lastSeenAt: { gte: since } } })) as number;
  }
}

let storeInstance: Store | null = null;

export async function initStore(): Promise<Store> {
  if (config.databaseUrl) {
    const s = new PrismaStore();
    try {
      await s.init();
      console.log('[store] connected to PostgreSQL');
      storeInstance = s;
      return s;
    } catch (e) {
      if (config.strictDb) throw e;
      console.warn('[store] PostgreSQL unavailable — falling back to the local memory store.', (e as Error).message);
    }
  }
  const m = new MemoryStore(config.memoryStoreFile);
  await m.init();
  console.log(`[store] using memory store (${config.memoryStoreFile})`);
  storeInstance = m;
  return m;
}

export function store(): Store {
  if (!storeInstance) throw new Error('store not initialised');
  return storeInstance;
}
