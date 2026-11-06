/**
 * OfficeRoom — authoritative multiplayer room for one office instance (max 50 users).
 *
 * Authority model:
 *  - Movement: client-predicted, server-validated (speed, bounds, wall crossing, solid obstacles).
 *    Invalid moves are rejected and the client receives a `correction`.
 *  - Seats, work sessions & timers, chat routing, object states, whiteboards: fully server-owned.
 *  - Transforms are broadcast as compact per-client snapshots (15 Hz) with interest management:
 *    near players every tick, far players every 4th tick, plus a staggered 1 Hz keyframe.
 */
import { Room, type Client } from '@colyseus/core';
import {
  AnimCode,
  C2S,
  CHAT_MAX_LENGTH,
  CHAT_RATE_MAX,
  CHAT_RATE_WINDOW_MS,
  DEFAULT_OBJECT_STATES,
  EMOTES,
  EMOTE_DURATION_MS,
  FAR_PLAYER_TICK_DIVISOR,
  INTERACTABLE_BY_ID,
  INTEREST_RADIUS,
  NEARBY_CHAT_RADIUS,
  RECONNECT_GRACE_SECONDS,
  ROOM_NAV_TARGET,
  S2C,
  SEAT_BY_ID,
  SEAT_RANGE,
  SERVER_TICK_HZ,
  SPAWN,
  TV_SLIDE_COUNT,
  WHITEBOARD_IDS,
  WHITEBOARD_MAX_LENGTH,
  getNavNode,
  sanitizeName,
  validateMove,
  zoneAt,
  zonesConnected,
  type ChatMsg,
  type CheckInResultMsg,
  type KioskDisplay,
  type LeaderboardData,
  type LeaderboardEntry,
  type ChatSendMsg,
  type EmoteName,
  type InteractMsg,
  type JoinOptions,
  type MoveMsg,
  type NoticeMsg,
  type SeatResultMsg,
  type SnapshotEntry,
  type ZoneId,
} from '@xbrain/shared';
import { config } from '../config';
import { verifyToken } from '../services/auth';
import { FloodCounter, TokenBucket } from '../services/rateLimit';
import { store, type UserRecord } from '../services/store';
import { dayKey, localMinutes, startOfDay, startOfMonth, startOfWeek } from '../services/time';
import { removeVoiceParticipant, setVoicePublish } from '../services/voice';
import { AttendanceEntry, OfficeState, Player } from './schema';

interface WorkRuntime {
  deskId: string;
  dbId: Promise<string | null>;
  /** Accumulated ms before the current segment (includes carried-over time in pause mode). */
  accumMs: number;
  /** Accum carried over from a previous paused session (not part of this DB row). */
  baseMs: number;
  segmentStart: number;
  startedAt: number;
}

interface PlayerRuntime {
  sid: string;
  idx: number;
  user: UserRecord;
  x: number;
  y: number;
  z: number;
  rotY: number;
  anim: number;
  lastMoveAt: number;
  lastChangeTick: number;
  connected: boolean;
  disconnectedAt: number;
  kicked: boolean;
  work: WorkRuntime | null;
  pausedAccumMs: number;
  pausedDay: number;
  chatMutedUntil: number;
  lastChat: { text: string; at: number };
  chatTimes: number[];
  todayClosedMs: number;
  buckets: {
    move: TokenBucket;
    interact: TokenBucket;
    emote: TokenBucket;
    misc: TokenBucket;
    board: TokenBucket;
  };
  flood: FloodCounter;
  violations: number;
}

/** Live room registry (admin API & stats). */
export const officeRooms = new Map<string, OfficeRoom>();

const ANIM_MAX = AnimCode.Turn;
const q = (v: number, m: number) => Math.round(v * m);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export class OfficeRoom extends Room<OfficeState> {
  private rt = new Map<string, PlayerRuntime>();
  private tickNo = 0;
  private nextIdx = 1;
  private officeId = config.office.id;
  private msgCounter = 0;

  // ───────────────────────────── lifecycle ─────────────────────────────
  async onCreate(options: { officeId?: string; name?: string; capacity?: number }) {
    this.officeId = options.officeId ?? config.office.id;
    const st = new OfficeState();
    st.officeId = this.officeId;
    st.officeName = options.name ?? config.office.name;
    st.capacity = options.capacity ?? config.office.capacity;
    st.allowTeleport = config.allowTeleport;
    st.serverStartedAt = Date.now();
    for (const [id, v] of Object.entries(DEFAULT_OBJECT_STATES)) st.objects.set(id, v);
    for (const id of WHITEBOARD_IDS) st.boards.set(id, 'Meeting notes\n• Sprint review 14:00\n• Demo XBrain Virtual Office');
    this.setState(st);
    this.autoDispose = false;
    this.maxClients = st.capacity;
    this.setPatchRate(100);
    this.setMetadata({ officeId: this.officeId, name: st.officeName });
    this.setSimulationInterval(() => this.tick(), 1000 / SERVER_TICK_HZ);
    this.clock.setInterval(() => this.persistHeartbeat(), 60_000);
    st.lateAfter = config.attendanceLateAfter;
    st.attendanceDay = dayKey();
    void this.loadAttendance();
    this.clock.setInterval(() => void this.refreshAttendance(), 5 * 60_000);
    void this.refreshLeaderboard();
    this.clock.setInterval(() => void this.refreshLeaderboard(), 15_000);
    officeRooms.set(this.officeId, this);
    this.registerHandlers();
    console.log(`[room] office "${this.officeId}" created (capacity ${st.capacity})`);
  }

  async onAuth(_client: Client, options: JoinOptions) {
    const tok = verifyToken(options?.token);
    if (!tok) throw new Error('unauthorized');
    const user = await store().getUser(tok.uid);
    if (!user) throw new Error('unknown_user');
    if (user.banned) throw new Error('banned');
    return user;
  }

  onJoin(client: Client, _options: JoinOptions, auth?: UserRecord) {
    const user = auth!;
    // One live avatar per account: replace an older session of the same user.
    for (const other of this.rt.values()) {
      if (other.user.id === user.id && other.sid !== client.sessionId) {
        const oc = this.clients.find((c) => c.sessionId === other.sid);
        other.kicked = true;
        oc?.send(S2C.Notice, { level: 'warn', text: 'You joined from another tab or device.', code: 'replaced' } satisfies NoticeMsg);
        if (oc) oc.leave(4001);
        else this.finalizePlayer(other, 'replaced');
      }
    }

    const idx = this.nextIdx++;
    if (this.nextIdx > 65000) this.nextIdx = 1;
    const x = SPAWN.x + (Math.random() - 0.5) * SPAWN.spreadX * 2;
    const z = SPAWN.z + (Math.random() - 0.5) * SPAWN.spreadZ * 2;
    const now = Date.now();
    const p: PlayerRuntime = {
      sid: client.sessionId,
      idx,
      user,
      x, y: 0, z,
      rotY: SPAWN.rotY,
      anim: AnimCode.Idle,
      lastMoveAt: now,
      lastChangeTick: this.tickNo,
      connected: true,
      disconnectedAt: 0,
      kicked: false,
      work: null,
      pausedAccumMs: 0,
      pausedDay: 0,
      chatMutedUntil: 0,
      lastChat: { text: '', at: 0 },
      chatTimes: [],
      todayClosedMs: 0,
      buckets: {
        move: new TokenBucket(40, 25),
        interact: new TokenBucket(6, 3),
        emote: new TokenBucket(3, 1),
        misc: new TokenBucket(10, 4),
        board: new TokenBucket(6, 2),
      },
      flood: new FloodCounter(),
      violations: 0,
    };
    this.rt.set(client.sessionId, p);

    const pl = new Player();
    pl.idx = idx;
    pl.userId = user.id;
    pl.name = user.displayName;
    pl.avatar = JSON.stringify(user.avatar ?? {});
    pl.role = user.role;
    pl.zone = zoneAt(x, z) ?? 'outside';
    pl.joinedAt = now;
    this.state.players.set(client.sessionId, pl);

    // Initial full snapshot (everyone) + own spawn position.
    client.send(S2C.Snapshot, { t: now, p: this.allEntries(client.sessionId) });
    client.send(S2C.Teleported, { x, y: 0, z, rotY: SPAWN.rotY, reason: 'spawn' });
    this.loadTodayStats(p).catch(() => undefined);
    store().touchUser(user.id).catch(() => undefined);
    console.log(`[room] + ${user.displayName} (${client.sessionId}) — ${this.clients.length}/${this.maxClients}`);
  }

  async onLeave(client: Client, consented: boolean) {
    const p = this.rt.get(client.sessionId);
    if (!p) return;
    const pl = this.state.players.get(client.sessionId);
    if (consented || p.kicked) {
      this.finalizePlayer(p, p.kicked ? 'kicked' : 'leave');
      return;
    }
    // Unexpected disconnect → keep seat & avatar for a grace period, pause the work timer.
    const now = Date.now();
    p.connected = false;
    p.disconnectedAt = now;
    if (pl) pl.online = false;
    if (p.work && p.work.segmentStart) {
      p.work.accumMs += now - p.work.segmentStart;
      p.work.segmentStart = 0;
      if (pl) {
        pl.workAccumMs = p.work.accumMs;
        pl.workSegmentStart = 0;
      }
    }
    try {
      await this.allowReconnection(client, RECONNECT_GRACE_SECONDS);
      // Reconnected
      p.connected = true;
      p.disconnectedAt = 0;
      p.lastMoveAt = Date.now();
      if (pl) pl.online = true;
      if (p.work) {
        p.work.segmentStart = Date.now();
        if (pl) pl.workSegmentStart = p.work.segmentStart;
      }
      client.send(S2C.Snapshot, { t: Date.now(), p: this.allEntries(client.sessionId) });
      client.send(S2C.Teleported, { x: p.x, y: p.y, z: p.z, rotY: p.rotY, reason: 'reconnect' });
      console.log(`[room] ↺ ${p.user.displayName} reconnected`);
    } catch {
      this.finalizePlayer(p, 'disconnect');
    }
  }

  async onDispose() {
    officeRooms.delete(this.officeId);
    const pending = [...this.rt.values()].map((p) => this.stopWork(p, 'server_restart'));
    await Promise.allSettled(pending);
  }

  // ───────────────────────────── handlers ─────────────────────────────
  private on<T>(type: string, handler: (client: Client, p: PlayerRuntime, msg: T) => void) {
    this.onMessage(type, (client, msg: T) => {
      const p = this.rt.get(client.sessionId);
      if (!p) return;
      this.msgCounter++;
      if (p.flood.hit(config.floodLimit)) {
        console.warn(`[room] flood from ${client.sessionId} — disconnecting`);
        p.kicked = true;
        client.leave(4008);
        return;
      }
      try {
        handler(client, p, msg);
      } catch (e) {
        console.error(`[room] handler "${type}" failed`, e);
      }
    });
  }

  private registerHandlers() {
    this.on<MoveMsg>(C2S.Move, (client, p, m) => this.handleMove(client, p, m));
    this.on<{ seatId: string }>(C2S.Sit, (client, p, m) => this.handleSit(client, p, m?.seatId));
    this.on<unknown>(C2S.Stand, (client, p) => this.handleStand(client, p));
    this.on<ChatSendMsg>(C2S.Chat, (client, p, m) => this.handleChat(client, p, m));
    this.on<{ name: EmoteName }>(C2S.Emote, (_c, p, m) => {
      if (!p.buckets.emote.take() || !EMOTES.includes(m?.name)) return;
      if (p.work && m.name === 'dance') return;
      this.broadcast(S2C.Emote, { sid: p.sid, name: m.name, t: Date.now() });
    });
    this.on<InteractMsg>(C2S.Interact, (client, p, m) => this.handleInteract(client, p, m));
    this.on<{ id: string; text: string }>(C2S.Whiteboard, (client, p, m) => this.handleWhiteboard(client, p, m));
    this.on<{ micOn: boolean }>(C2S.VoiceState, (_c, p, m) => {
      if (!p.buckets.misc.take()) return;
      const pl = this.state.players.get(p.sid);
      if (pl) pl.micOn = !!m?.micOn && !pl.muted;
    });
    this.on<{ t: number }>(C2S.Ping, (client, _p, m) => {
      client.send(S2C.Pong, { t: isNum(m?.t) ? m.t : 0, s: Date.now() });
    });
    this.on<unknown>(C2S.MyStats, (client, p) => {
      if (!p.buckets.misc.take()) return;
      this.sendStats(client, p).catch(() => undefined);
    });
    this.on<unknown>(C2S.CheckIn, (client, p) => void this.handleCheckIn(client, p));
    this.on<{ zone: ZoneId }>(C2S.Teleport, (client, p, m) => this.handleTeleport(client, p, m?.zone));
    this.on<unknown>(C2S.AvatarUpdated, (_c, p) => {
      if (!p.buckets.misc.take(3)) return;
      this.reloadUser(p).catch(() => undefined);
    });
  }

  private handleMove(client: Client, p: PlayerRuntime, m: MoveMsg) {
    if (!p.buckets.move.take() || !m) return;
    if (p.work || this.state.players.get(p.sid)?.seatId) return; // seated players don't move
    const now = Date.now();
    const next = { x: Number(m.x), y: Number(m.y), z: Number(m.z) };
    const check = validateMove(p, next, now - p.lastMoveAt);
    if (!check.ok) {
      p.violations++;
      client.send(S2C.Correction, { x: p.x, y: p.y, z: p.z, reason: check.reason });
      return;
    }
    let anim = Math.max(0, Math.min(ANIM_MAX, Math.floor(Number(m.a) || 0)));
    if (anim === AnimCode.Sit || anim === AnimCode.Type) anim = AnimCode.Idle;
    const rotY = isNum(m.r) ? Math.atan2(Math.sin(m.r), Math.cos(m.r)) : p.rotY;
    const changed = Math.abs(next.x - p.x) > 0.005 || Math.abs(next.z - p.z) > 0.005 || Math.abs(next.y - p.y) > 0.005 || Math.abs(rotY - p.rotY) > 0.01 || anim !== p.anim;
    p.x = next.x;
    p.y = next.y;
    p.z = next.z;
    p.rotY = rotY;
    p.anim = anim;
    p.lastMoveAt = now;
    if (changed) {
      p.lastChangeTick = this.tickNo;
      const zone = zoneAt(p.x, p.z);
      const pl = this.state.players.get(p.sid);
      if (zone && pl && pl.zone !== zone) pl.zone = zone;
    }
  }

  private seatReply(client: Client, msg: SeatResultMsg) {
    client.send(S2C.SeatResult, msg);
  }

  private handleSit(client: Client, p: PlayerRuntime, seatId: string) {
    if (!p.buckets.interact.take()) return;
    const seat = typeof seatId === 'string' ? SEAT_BY_ID[seatId] : undefined;
    const pl = this.state.players.get(p.sid);
    if (!seat || !pl) return this.seatReply(client, { ok: false, seatId: String(seatId), action: 'sit', reason: 'Unknown seat' });
    if (pl.seatId) return this.seatReply(client, { ok: false, seatId, action: 'sit', reason: 'You are already seated' });
    const occupant = this.state.seats.get(seatId);
    if (occupant) {
      const name = this.state.players.get(occupant)?.name ?? 'someone';
      return this.seatReply(client, { ok: false, seatId, action: 'sit', reason: `This seat is taken by ${name}` });
    }
    if (Math.hypot(p.x - seat.x, p.z - seat.z) > SEAT_RANGE + 0.8) {
      return this.seatReply(client, { ok: false, seatId, action: 'sit', reason: 'Too far from the seat' });
    }
    this.state.seats.set(seatId, p.sid);
    pl.seatId = seatId;
    p.x = seat.x;
    p.z = seat.z;
    p.y = Math.max(0, seat.seatHeight - 0.47);
    p.rotY = seat.rotY;
    p.anim = seat.kind === 'desk' ? AnimCode.Type : AnimCode.Sit;
    p.lastChangeTick = this.tickNo;
    pl.zone = seat.zone;
    if (seat.kind === 'desk') this.startWork(p, seat.deskId!);
    this.seatReply(client, { ok: true, seatId, action: 'sit' });
  }

  private handleStand(client: Client, p: PlayerRuntime) {
    if (!p.buckets.interact.take()) return;
    const pl = this.state.players.get(p.sid);
    if (!pl || !pl.seatId) return this.seatReply(client, { ok: false, seatId: '', action: 'stand', reason: 'Not seated' });
    const seatId = pl.seatId;
    this.releaseSeat(p, 'stand');
    this.seatReply(client, { ok: true, seatId, action: 'stand' });
  }

  private releaseSeat(p: PlayerRuntime, reason: string) {
    const pl = this.state.players.get(p.sid);
    const seatId = pl?.seatId;
    if (p.work) void this.stopWork(p, reason);
    if (!seatId) return;
    const seat = SEAT_BY_ID[seatId];
    if (this.state.seats.get(seatId) === p.sid) this.state.seats.delete(seatId);
    if (pl) pl.seatId = '';
    if (seat) {
      p.x = seat.stand.x;
      p.z = seat.stand.z;
      p.y = 0;
    }
    p.anim = AnimCode.Idle;
    p.lastMoveAt = Date.now();
    p.lastChangeTick = this.tickNo;
  }

  // ───────────────────────────── work sessions ─────────────────────────────
  private startWork(p: PlayerRuntime, deskId: string) {
    const now = Date.now();
    const pl = this.state.players.get(p.sid);
    const today = startOfDay(now);
    const carried = config.workStandMode === 'pause' && p.pausedDay === today ? p.pausedAccumMs : 0;
    const dbId = store()
      .startWorkSession({ userId: p.user.id, officeId: this.officeId, deskId, startedAt: new Date(now) })
      .catch((e) => {
        console.error('[room] failed to create work session', e);
        return null;
      });
    p.work = { deskId, dbId, accumMs: carried, baseMs: carried, segmentStart: now, startedAt: now };
    if (pl) {
      pl.working = true;
      pl.workAccumMs = carried;
      pl.workSegmentStart = now;
    }
  }

  private activeMs(w: WorkRuntime, at = Date.now()) {
    return w.accumMs + (w.segmentStart ? Math.max(0, at - w.segmentStart) : 0);
  }

  private async stopWork(p: PlayerRuntime, reason: string) {
    const w = p.work;
    if (!w) return;
    p.work = null;
    // While disconnected the segment is already paused, so disconnected time is never counted.
    const total = this.activeMs(w);
    const sessionMs = Math.max(0, total - w.baseMs);
    p.todayClosedMs += sessionMs;
    if (config.workStandMode === 'pause') {
      p.pausedAccumMs = total;
      p.pausedDay = startOfDay();
    }
    const pl = this.state.players.get(p.sid);
    if (pl) {
      pl.working = false;
      pl.workAccumMs = 0;
      pl.workSegmentStart = 0;
    }
    const id = await w.dbId;
    if (id) await store().updateWorkSession(id, { activeMs: sessionMs, endedAt: new Date(), endReason: reason }).catch((e) => console.error('[room] failed to close work session', e));
    void this.refreshLeaderboard();
  }

  // ───────────────────────────── leaderboard ─────────────────────────────
  private lbBusy = false;

  /** Top workers per period: closed sessions from the store + live running sessions. */
  private async refreshLeaderboard() {
    if (this.lbBusy) return;
    this.lbBusy = true;
    try {
      const now = Date.now();
      const periods: Array<[keyof Omit<LeaderboardData, 'at'>, number]> = [['today', startOfDay(now)], ['week', startOfWeek(now)], ['month', startOfMonth(now)]];
      const out: LeaderboardData = { at: now, today: [], week: [], month: [] };
      for (const [key, since] of periods) {
        const rows = await store().workLeaderboard(this.officeId, new Date(since), 30);
        const map = new Map<string, LeaderboardEntry>(rows.map((r) => [r.userId, { userId: r.userId, name: r.displayName, ms: r.totalMs, sessions: r.sessions, working: false }]));
        for (const p of this.rt.values()) {
          const w = p.work;
          const pl = this.state.players.get(p.sid);
          if (pl) {
            const e = map.get(p.user.id);
            if (e) e.name = pl.name;
          }
          if (!w || w.startedAt < since) continue;
          const live = Math.max(0, this.activeMs(w, now) - w.baseMs);
          const e = map.get(p.user.id) ?? { userId: p.user.id, name: pl?.name ?? p.user.displayName, ms: 0, sessions: 0, working: false };
          e.ms += live;
          e.sessions += 1;
          e.working = !!w.segmentStart;
          map.set(p.user.id, e);
        }
        out[key] = [...map.values()].sort((a, b) => b.ms - a.ms).slice(0, 10);
      }
      this.state.leaderboard = JSON.stringify(out);
    } catch (e) {
      console.warn('[room] leaderboard refresh failed', (e as Error).message);
    } finally {
      this.lbBusy = false;
    }
  }

  private async persistHeartbeat() {
    for (const p of this.rt.values()) {
      const w = p.work;
      if (!w) continue;
      const id = await w.dbId;
      if (id) await store().updateWorkSession(id, { activeMs: this.activeMs(w) - w.baseMs }).catch(() => undefined);
    }
  }

  private async loadTodayStats(p: PlayerRuntime) {
    const t = await store().workTotals(p.user.id, new Date(startOfDay()));
    p.todayClosedMs = t.totalMs;
  }

  private async sendStats(client: Client, p: PlayerRuntime) {
    const [today, week] = await Promise.all([
      store().workTotals(p.user.id, new Date(startOfDay()), true),
      store().workTotals(p.user.id, new Date(startOfWeek()), true),
    ]);
    // Closed sessions only; the client adds the live running session from replicated state
    // (minus runningBaseMs, which is time carried over in 'pause' mode and already counted).
    client.send(S2C.Stats, {
      todayMs: today.totalMs,
      sessionsToday: today.sessions + (p.work ? 1 : 0),
      weekMs: week.totalMs,
      runningBaseMs: p.work?.baseMs ?? 0,
    });
  }

  // ───────────────────────────── chat ─────────────────────────────
  private handleChat(client: Client, p: PlayerRuntime, m: ChatSendMsg) {
    const now = Date.now();
    const notice = (text: string) => client.send(S2C.Notice, { level: 'warn', text } satisfies NoticeMsg);
    p.chatTimes = p.chatTimes.filter((t) => now - t < CHAT_RATE_WINDOW_MS);
    if (p.chatTimes.length >= CHAT_RATE_MAX) return notice('You are sending messages too quickly.');
    if (p.chatMutedUntil > now) return notice('You are muted by an administrator.');
    if (!m || typeof m.text !== 'string') return;
    const text = m.text.normalize('NFC').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LENGTH);
    if (!text) return;
    if (text === p.lastChat.text && now - p.lastChat.at < 4000) return notice('Duplicate message ignored.');
    p.chatTimes.push(now);
    p.lastChat = { text, at: now };
    const pl = this.state.players.get(p.sid)!;
    const base: ChatMsg = { id: `${p.idx}-${now}-${(this.msgCounter++ % 1000).toString(36)}`, channel: m.channel, from: p.sid, fromUserId: p.user.id, fromName: pl.name, text, t: now };

    let recipients: Client[] = [];
    switch (m.channel) {
      case 'global':
        recipients = [...this.clients];
        break;
      case 'nearby': {
        const r2 = NEARBY_CHAT_RADIUS * NEARBY_CHAT_RADIUS;
        const objects = (id: string) => this.state.objects.get(id);
        recipients = this.clients.filter((c) => {
          const o = this.rt.get(c.sessionId);
          if (!o || (o.x - p.x) ** 2 + (o.z - p.z) ** 2 > r2) return false;
          // Private rooms are sound-proof: no nearby chat through closed doors.
          return zonesConnected(zoneAt(p.x, p.z), zoneAt(o.x, o.z), objects);
        });
        break;
      }
      case 'meeting': {
        if (pl.zone !== 'meeting') return notice('Meeting chat is only available inside the Meeting Room.');
        recipients = this.clients.filter((c) => this.state.players.get(c.sessionId)?.zone === 'meeting');
        break;
      }
      case 'private': {
        const target = typeof m.to === 'string' ? this.state.players.get(m.to) : undefined;
        if (!target || m.to === p.sid) return notice('That user is not online.');
        base.to = m.to;
        base.toName = target.name;
        recipients = this.clients.filter((c) => c.sessionId === m.to || c.sessionId === p.sid);
        break;
      }
      default:
        return;
    }
    for (const c of recipients) c.send(S2C.Chat, base);
    if (config.chatPersist) {
      const toUser = m.channel === 'private' && m.to ? this.state.players.get(m.to)?.userId : undefined;
      store().saveChat({ officeId: this.officeId, channel: m.channel, senderId: p.user.id, recipientId: toUser, text }).catch(() => undefined);
    }
  }

  // ───────────────────────────── objects ─────────────────────────────
  private handleInteract(client: Client, p: PlayerRuntime, m: InteractMsg) {
    if (!p.buckets.interact.take() || !m || typeof m.id !== 'string') return;
    const def = INTERACTABLE_BY_ID[m.id];
    if (!def || def.kind === 'seat' || def.kind === 'view' || def.kind === 'whiteboard') return;
    if (Math.hypot(p.x - def.x, p.z - def.z) > def.radius + 1.5) {
      client.send(S2C.Notice, { level: 'warn', text: `Move closer to the ${def.label}.` } satisfies NoticeMsg);
      return;
    }
    const cur = this.state.objects.get(def.id) ?? 0;
    const now = Date.now();
    switch (def.kind) {
      case 'door':
      case 'toggle':
      case 'lamp':
        this.state.objects.set(def.id, cur ? 0 : 1);
        break;
      case 'timed':
        if (now - cur < 6000) return;
        this.state.objects.set(def.id, now);
        break;
      case 'tv':
        if (m.action === 'next' && cur > 0) this.state.objects.set(def.id, (cur % TV_SLIDE_COUNT) + 1);
        else this.state.objects.set(def.id, cur ? 0 : 1);
        break;
    }
  }

  private handleWhiteboard(client: Client, p: PlayerRuntime, m: { id: string; text: string }) {
    if (!p.buckets.board.take() || !m || typeof m.text !== 'string') return;
    if (!(WHITEBOARD_IDS as readonly string[]).includes(m.id)) return;
    const def = INTERACTABLE_BY_ID[m.id];
    const pl = this.state.players.get(p.sid);
    const inRoom = pl?.zone === def.zone;
    if (!inRoom && Math.hypot(p.x - def.x, p.z - def.z) > 5) {
      client.send(S2C.Notice, { level: 'warn', text: 'Go to the meeting room to edit the whiteboard.' } satisfies NoticeMsg);
      return;
    }
    const text = m.text.normalize('NFC').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').slice(0, WHITEBOARD_MAX_LENGTH);
    this.state.boards.set(m.id, text);
  }

  // ───────────────────────────── attendance ─────────────────────────────
  private async loadAttendance() {
    const day = dayKey();
    const rows = await store().attendanceForDay(this.officeId, day).catch(() => []);
    this.state.attendanceDay = day;
    this.state.attendance.clear();
    for (const r of rows) this.setAttendance(r.userId, r.displayName, r.at.getTime(), r.late);
    this.state.activeWeek = await store().activeUsersSince(new Date(startOfWeek())).catch(() => this.state.activeWeek);
  }

  private async refreshAttendance() {
    if (this.state.attendanceDay !== dayKey()) await this.loadAttendance();
    else this.state.activeWeek = await store().activeUsersSince(new Date(startOfWeek())).catch(() => this.state.activeWeek);
  }

  private setAttendance(userId: string, name: string, time: number, late: boolean) {
    const e = new AttendanceEntry();
    e.userId = userId;
    e.name = name;
    e.time = time;
    e.late = late;
    this.state.attendance.set(userId, e);
  }

  private async handleCheckIn(client: Client, p: PlayerRuntime) {
    if (!p.buckets.interact.take()) return;
    const kiosk = INTERACTABLE_BY_ID.checkin;
    const pl = this.state.players.get(p.sid);
    if (!pl) return;
    if (Math.hypot(p.x - kiosk.x, p.z - kiosk.z) > kiosk.radius + 1.5) {
      client.send(S2C.CheckInResult, { ok: false, already: false, name: pl.name, time: 0, late: false, reason: 'Stand in front of the Face ID terminal to check in.' } satisfies CheckInResultMsg);
      return;
    }
    if (this.state.attendanceDay !== dayKey()) await this.loadAttendance();
    const now = Date.now();
    const late = localMinutes(now) > this.state.lateAfter;
    try {
      const r = await store().checkIn({ userId: p.user.id, officeId: this.officeId, day: dayKey(now), at: new Date(now), late });
      this.setAttendance(p.user.id, pl.name, r.at.getTime(), r.late);
      this.state.activeWeek = Math.max(this.state.activeWeek, this.state.attendance.size);
      const msg: CheckInResultMsg = { ok: true, already: r.already, name: pl.name, time: r.at.getTime(), late: r.late };
      client.send(S2C.CheckInResult, msg);
      this.state.boards.set('kiosk', JSON.stringify({ name: pl.name, time: msg.time, late: msg.late, already: msg.already } satisfies KioskDisplay));
    } catch (e) {
      console.error('[room] check-in failed', e);
      client.send(S2C.CheckInResult, { ok: false, already: false, name: pl.name, time: 0, late: false, reason: 'Attendance service unavailable, please try again.' } satisfies CheckInResultMsg);
    }
  }

  private handleTeleport(client: Client, p: PlayerRuntime, zone: ZoneId) {
    if (!p.buckets.misc.take()) return;
    if (!this.state.allowTeleport && p.user.role !== 'admin') {
      client.send(S2C.Notice, { level: 'warn', text: 'Teleport is disabled by the administrator.' } satisfies NoticeMsg);
      return;
    }
    if (this.state.players.get(p.sid)?.seatId) return;
    const nodeId = ROOM_NAV_TARGET[zone];
    const node = nodeId ? getNavNode(nodeId) : undefined;
    if (!node) return;
    p.x = node.x;
    p.z = node.z;
    p.y = 0;
    p.lastMoveAt = Date.now();
    p.lastChangeTick = this.tickNo;
    client.send(S2C.Teleported, { x: p.x, y: 0, z: p.z, rotY: p.rotY, reason: 'teleport' });
  }

  private async reloadUser(p: PlayerRuntime) {
    const u = await store().getUser(p.user.id);
    const pl = this.state.players.get(p.sid);
    if (!u || !pl) return;
    p.user = u;
    pl.name = sanitizeName(u.displayName) || pl.name;
    pl.avatar = JSON.stringify(u.avatar ?? {});
  }

  // ───────────────────────────── snapshots ─────────────────────────────
  private entry(p: PlayerRuntime): SnapshotEntry {
    return [p.idx, q(p.x, 100), q(p.y, 100), q(p.z, 100), q(p.rotY, 1000), p.anim];
  }

  private allEntries(exceptSid: string): SnapshotEntry[] {
    const out: SnapshotEntry[] = [];
    for (const p of this.rt.values()) if (p.sid !== exceptSid) out.push(this.entry(p));
    return out;
  }

  private tick() {
    this.tickNo++;
    const now = Date.now();
    const players = [...this.rt.values()];
    const r2 = INTEREST_RADIUS * INTEREST_RADIUS;
    const farTick = this.tickNo % FAR_PLAYER_TICK_DIVISOR === 0;
    for (const client of this.clients) {
      const me = this.rt.get(client.sessionId);
      if (!me || !me.connected) continue;
      const entries: SnapshotEntry[] = [];
      for (const p of players) {
        if (p.sid === me.sid) continue;
        const keyframe = (this.tickNo + p.idx) % SERVER_TICK_HZ === 0;
        const changed = this.tickNo - p.lastChangeTick <= 2;
        if (!changed && !keyframe) continue;
        if (!keyframe) {
          const near = (p.x - me.x) ** 2 + (p.z - me.z) ** 2 <= r2;
          if (!near && !farTick) continue;
        }
        entries.push(this.entry(p));
      }
      if (entries.length) client.send(S2C.Snapshot, { t: now, p: entries });
    }
  }

  // ───────────────────────────── teardown ─────────────────────────────
  private finalizePlayer(p: PlayerRuntime, reason: string) {
    if (!this.rt.has(p.sid)) return;
    this.releaseSeat(p, reason);
    this.rt.delete(p.sid);
    this.state.players.delete(p.sid);
    store().touchUser(p.user.id).catch(() => undefined);
    void removeVoiceParticipant(this.officeId, p.sid);
    console.log(`[room] - ${p.user.displayName} (${reason}) — ${this.clients.length}/${this.maxClients}`);
  }

  // ───────────────────────────── admin API ─────────────────────────────
  listPlayers() {
    const now = Date.now();
    return [...this.rt.values()].map((p) => {
      const pl = this.state.players.get(p.sid);
      return {
        sessionId: p.sid,
        userId: p.user.id,
        name: pl?.name ?? p.user.displayName,
        role: p.user.role,
        zone: pl?.zone,
        seatId: pl?.seatId || null,
        working: !!p.work,
        workMs: p.work ? this.activeMs(p.work, now) : 0,
        online: p.connected,
        micOn: !!pl?.micOn,
        muted: !!pl?.muted,
        position: { x: +p.x.toFixed(2), z: +p.z.toFixed(2) },
        violations: p.violations,
      };
    });
  }

  stats() {
    let working = 0;
    let online = 0;
    for (const p of this.rt.values()) {
      if (p.work) working++;
      if (p.connected) online++;
    }
    let desksUsed = 0;
    this.state.seats.forEach((_sid, seatId) => {
      if (SEAT_BY_ID[seatId]?.kind === 'desk') desksUsed++;
    });
    return { online, present: this.rt.size, working, desksUsed, capacity: this.maxClients, clients: this.clients.length };
  }

  kick(sessionId: string, reason = 'Removed by an administrator') {
    const p = this.rt.get(sessionId);
    if (!p) return false;
    p.kicked = true;
    const c = this.clients.find((cl) => cl.sessionId === sessionId);
    store().addModeration({ userId: p.user.id, action: 'kick', reason }).catch(() => undefined);
    if (c) {
      c.send(S2C.Notice, { level: 'error', text: reason, code: 'kicked' } satisfies NoticeMsg);
      c.leave(4003);
    } else this.finalizePlayer(p, 'kicked');
    return true;
  }

  mute(sessionId: string, muted: boolean, minutes = 15) {
    const p = this.rt.get(sessionId);
    const pl = this.state.players.get(sessionId);
    if (!p || !pl) return false;
    p.chatMutedUntil = muted ? Date.now() + minutes * 60_000 : 0;
    pl.muted = muted;
    if (muted) pl.micOn = false;
    void setVoicePublish(this.officeId, sessionId, !muted);
    store().addModeration({ userId: p.user.id, action: muted ? 'mute' : 'unmute', expiresAt: muted ? new Date(p.chatMutedUntil) : undefined }).catch(() => undefined);
    const c = this.clients.find((cl) => cl.sessionId === sessionId);
    c?.send(S2C.Notice, { level: muted ? 'warn' : 'info', text: muted ? `You were muted by an administrator for ${minutes} min.` : 'You were unmuted.', code: muted ? 'muted' : 'unmuted' } satisfies NoticeMsg);
    return true;
  }

  isMuted(sessionId: string) {
    return !!this.state.players.get(sessionId)?.muted;
  }

  hasSession(sessionId: string, userId: string) {
    return this.rt.get(sessionId)?.user.id === userId;
  }

  async setCapacity(capacity: number) {
    this.maxClients = capacity;
    this.state.capacity = capacity;
    if (this.clients.length < capacity) await this.unlock();
    else await this.lock();
    await store().setOfficeCapacity(this.officeId, capacity).catch(() => undefined);
  }

  setAllowTeleport(allow: boolean) {
    this.state.allowTeleport = allow;
  }

  /** Remaining emote duration helper (exposed for tests). */
  static emoteDuration(name: EmoteName) {
    return EMOTE_DURATION_MS[name];
  }
}
