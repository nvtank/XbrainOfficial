/**
 * Load test: N real WebSocket clients (default 50) join the office through the
 * same REST + Colyseus flow as the browser, then walk the navigation graph,
 * sit at desks (work timers), stand up, chat and emote.
 *
 * Measures: join success, server→client snapshot rate & bandwidth, ping RTT,
 * snapshot one-way latency (same machine), movement corrections, seat
 * conflicts, and server CPU / RAM (via /api/admin/status, needs ADMIN_TOKEN).
 *
 *   npm run loadtest -- --url http://localhost:2567 --clients 50 --duration 90 --admin <ADMIN_TOKEN>
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client, type Room } from 'colyseus.js';
import {
  AnimCode,
  C2S,
  DESKS,
  NAV_NODES,
  S2C,
  SEAT_BY_ID,
  WALK_SPEED,
  nearestNavNode,
  randomAvatar,
  shortestPath,
  getNavNode,
  type SnapshotMsg,
} from '@xbrain/shared';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const URL_BASE = arg('url', 'http://localhost:2567').replace(/\/$/, '');
const CLIENTS = Number(arg('clients', '50'));
const DURATION = Number(arg('duration', '90'));
const SIT_RATIO = Number(arg('sit', '0.6'));
const ADMIN = arg('admin', process.env.ADMIN_TOKEN ?? '');
const RAMP_MS = Number(arg('ramp', '150'));

interface BotStats {
  joined: boolean;
  joinMs: number;
  snaps: number;
  bytes: number;
  rtts: number[];
  latencies: number[];
  corrections: number;
  sits: number;
  sitConflicts: number;
  chatsSent: number;
  chatsRecv: number;
  errors: string[];
  maxEntities: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (arr: number[], p: number) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

async function api<T>(method: string, p: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${URL_BASE}/api${p}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

class Bot {
  room!: Room;
  pos = { x: 0, z: 11 };
  rot = Math.PI;
  path: Array<{ x: number; z: number }> = [];
  seated: string | null = null;
  pending = false;
  standAt = 0;
  nextChat = Date.now() + 5000 + Math.random() * 20000;
  nextEmote = Date.now() + 10000 + Math.random() * 30000;
  pingSeq = 0;
  pingSent = new Map<number, number>();
  stats: BotStats = { joined: false, joinMs: 0, snaps: 0, bytes: 0, rtts: [], latencies: [], corrections: 0, sits: 0, sitConflicts: 0, chatsSent: 0, chatsRecv: 0, errors: [], maxEntities: 0 };
  timers: NodeJS.Timeout[] = [];
  wantsDesk = Math.random() < SIT_RATIO;

  constructor(public i: number) {}

  async start() {
    const t0 = Date.now();
    const { token } = await api<{ token: string }>('POST', '/auth/guest', { displayName: `Bot ${String(this.i).padStart(2, '0')}`, avatar: randomAvatar(this.i / CLIENTS) });
    const office = await api<{ roomId: string }>('GET', '/office');
    const client = new Client(URL_BASE.replace(/^http/, 'ws'));
    this.room = await client.joinById(office.roomId, { token, v: 'loadtest' });
    this.stats.joined = true;
    this.stats.joinMs = Date.now() - t0;
    const ws = (this.room.connection as unknown as { transport: { ws: WebSocket } }).transport.ws;
    ws.addEventListener('message', (e: MessageEvent) => {
      const d = e.data as ArrayBuffer | Buffer | string;
      this.stats.bytes += typeof d === 'string' ? d.length : (d as ArrayBuffer).byteLength;
    });
    this.room.onMessage(S2C.Snapshot, (m: SnapshotMsg) => {
      this.stats.snaps++;
      this.stats.maxEntities = Math.max(this.stats.maxEntities, m.p.length);
      this.stats.latencies.push(Date.now() - Number(m.t));
      if (this.stats.latencies.length > 4000) this.stats.latencies.splice(0, 2000);
    });
    this.room.onMessage(S2C.Pong, (m: { t: number }) => {
      const s = this.pingSent.get(m.t);
      if (s !== undefined) this.stats.rtts.push(Date.now() - s);
    });
    this.room.onMessage(S2C.Teleported, (m: { x: number; z: number }) => {
      this.pos = { x: m.x, z: m.z };
      this.path = [];
    });
    this.room.onMessage(S2C.Correction, (m: { x: number; z: number }) => {
      this.stats.corrections++;
      this.pos = { x: m.x, z: m.z };
      this.path = [];
    });
    this.room.onMessage(S2C.SeatResult, (m: { ok: boolean; seatId: string; action: string }) => {
      this.pending = false;
      if (m.action === 'sit') {
        if (m.ok) {
          this.seated = m.seatId;
          this.stats.sits++;
          this.standAt = Date.now() + 15000 + Math.random() * 30000;
        } else this.stats.sitConflicts++;
      } else if (m.ok && this.seated) {
        const s = SEAT_BY_ID[this.seated];
        this.pos = { x: s.stand.x, z: s.stand.z };
        this.seated = null;
      }
    });
    this.room.onMessage(S2C.Chat, () => this.stats.chatsRecv++);
    for (const t of [S2C.Emote, S2C.Stats, S2C.Notice]) this.room.onMessage(t, () => undefined);
    this.room.onError((code, msg) => this.stats.errors.push(`room error ${code} ${msg}`));
    this.room.onLeave((code) => {
      if (code !== 1000 && code !== 4000) this.stats.errors.push(`left with code ${code}`);
    });
    this.timers.push(setInterval(() => this.tick(), 1000 / 15));
    this.timers.push(
      setInterval(() => {
        const seq = ++this.pingSeq;
        this.pingSent.set(seq, Date.now());
        this.room.send(C2S.Ping, { t: seq });
      }, 2000),
    );
  }

  private planTo(target: { x: number; z: number }) {
    const from = nearestNavNode(this.pos.x, this.pos.z);
    const to = nearestNavNode(target.x, target.z);
    const ids = shortestPath(from.id, to.id);
    this.path = [...ids.map((id) => ({ x: getNavNode(id)!.x, z: getNavNode(id)!.z })), target];
  }

  private tick() {
    const now = Date.now();
    if (this.seated) {
      if (now > this.standAt && !this.pending) {
        this.pending = true;
        this.room.send(C2S.Stand, {});
      }
      this.chatAndEmote(now);
      return;
    }
    if (this.pending) return;
    if (!this.path.length) {
      if (this.wantsDesk && Math.random() < 0.5) {
        const desk = DESKS[Math.floor(Math.random() * DESKS.length)];
        const seat = SEAT_BY_ID[desk.seatId];
        this.planTo(seat.stand);
        (this.path as Array<{ x: number; z: number; seatId?: string }>)[this.path.length - 1].seatId = seat.id;
      } else {
        const n = NAV_NODES[Math.floor(Math.random() * NAV_NODES.length)];
        this.planTo({ x: n.x, z: n.z });
      }
    }
    // Walk toward the next waypoint at walking speed
    const wp = this.path[0] as { x: number; z: number; seatId?: string };
    const dx = wp.x - this.pos.x;
    const dz = wp.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const step = (WALK_SPEED * 0.95) / 15;
    let anim = AnimCode.Walk;
    if (d <= step) {
      this.pos = { x: wp.x, z: wp.z };
      this.path.shift();
      if (wp.seatId) {
        this.pending = true;
        this.room.send(C2S.Sit, { seatId: wp.seatId });
        anim = AnimCode.Idle;
      }
    } else {
      this.pos = { x: this.pos.x + (dx / d) * step, z: this.pos.z + (dz / d) * step };
      this.rot = Math.atan2(dx, dz);
    }
    this.room.send(C2S.Move, { x: +this.pos.x.toFixed(3), y: 0, z: +this.pos.z.toFixed(3), r: +this.rot.toFixed(3), a: anim });
    this.chatAndEmote(now);
  }

  private chatAndEmote(now: number) {
    if (now > this.nextChat) {
      this.nextChat = now + 20000 + Math.random() * 25000;
      this.room.send(C2S.Chat, { channel: Math.random() < 0.6 ? 'nearby' : 'global', text: `Hello from bot ${this.i} @ ${new Date().toLocaleTimeString()}` });
      this.stats.chatsSent++;
    }
    if (now > this.nextEmote && !this.seated) {
      this.nextEmote = now + 25000 + Math.random() * 30000;
      this.room.send(C2S.Emote, { name: ['wave', 'clap', 'thumbsup', 'cheer'][this.i % 4] });
    }
  }

  async stop() {
    this.timers.forEach(clearInterval);
    await this.room?.leave(true).catch(() => undefined);
  }
}

async function adminStatus() {
  if (!ADMIN) return null;
  try {
    const r = await fetch(`${URL_BASE}/api/admin/status`, { headers: { 'x-admin-token': ADMIN } });
    return r.ok ? ((await r.json()) as { cpuPercent: number; memory: { rssMB: number; heapUsedMB: number }; office: { present: number; working: number; desksUsed: number } | null }) : null;
  } catch {
    return null;
  }
}

async function main() {
  console.log(`\nXBrain load test → ${URL_BASE} · ${CLIENTS} clients · ${DURATION}s · ramp ${RAMP_MS}ms\n`);
  await adminStatus(); // prime the CPU sampler
  const bots = Array.from({ length: CLIENTS }, (_, i) => new Bot(i + 1));
  const startAll = Date.now();
  await Promise.all(
    bots.map(async (b, i) => {
      await sleep(i * RAMP_MS);
      try {
        await b.start();
      } catch (e) {
        b.stats.errors.push(`join failed: ${(e as Error).message}`);
      }
    }),
  );
  const joined = bots.filter((b) => b.stats.joined).length;
  console.log(`Joined ${joined}/${CLIENTS} in ${((Date.now() - startAll) / 1000).toFixed(1)}s`);

  const samples: Array<{ t: number; cpu: number; rss: number; heap: number; present: number; working: number }> = [];
  const t0 = Date.now();
  const bytes0 = bots.reduce((s, b) => s + b.stats.bytes, 0);
  const snaps0 = bots.reduce((s, b) => s + b.stats.snaps, 0);
  while (Date.now() - t0 < DURATION * 1000) {
    await sleep(5000);
    const st = await adminStatus();
    const el = Math.round((Date.now() - t0) / 1000);
    if (st) {
      samples.push({ t: el, cpu: st.cpuPercent, rss: st.memory.rssMB, heap: st.memory.heapUsedMB, present: st.office?.present ?? 0, working: st.office?.working ?? 0 });
      console.log(`  t=${String(el).padStart(3)}s  cpu ${String(st.cpuPercent).padStart(5)}%  rss ${st.memory.rssMB} MB  online ${st.office?.present}  working ${st.office?.working}  desks ${st.office?.desksUsed}`);
    } else console.log(`  t=${el}s`);
  }
  const elapsed = (Date.now() - t0) / 1000;
  const totalBytes = bots.reduce((s, b) => s + b.stats.bytes, 0) - bytes0;
  const totalSnaps = bots.reduce((s, b) => s + b.stats.snaps, 0) - snaps0;
  const rtts = bots.flatMap((b) => b.stats.rtts);
  const lat = bots.flatMap((b) => b.stats.latencies);
  const sum = (k: keyof BotStats) => bots.reduce((s, b) => s + (b.stats[k] as number), 0);
  const errors = bots.flatMap((b) => b.stats.errors.map((e) => `bot ${b.i}: ${e}`));

  const result = {
    date: new Date().toISOString(),
    url: URL_BASE,
    clients: CLIENTS,
    joined,
    durationSec: Math.round(elapsed),
    joinMs: { p50: pct(bots.map((b) => b.stats.joinMs), 50), p95: pct(bots.map((b) => b.stats.joinMs), 95) },
    snapshotsPerClientPerSec: +(totalSnaps / Math.max(1, joined) / elapsed).toFixed(1),
    downKBpsPerClient: +(totalBytes / 1024 / Math.max(1, joined) / elapsed).toFixed(1),
    downKBpsServerTotal: +(totalBytes / 1024 / elapsed).toFixed(1),
    maxEntitiesPerSnapshot: Math.max(...bots.map((b) => b.stats.maxEntities)),
    pingRttMs: { p50: pct(rtts, 50), p95: pct(rtts, 95), p99: pct(rtts, 99) },
    snapshotLatencyMs: { p50: pct(lat, 50), p95: pct(lat, 95), p99: pct(lat, 99) },
    corrections: sum('corrections'),
    sits: sum('sits'),
    seatConflictsRejected: sum('sitConflicts'),
    chatsSent: sum('chatsSent'),
    chatsReceived: sum('chatsRecv'),
    server: samples.length
      ? {
          cpuPercentAvg: +(samples.reduce((s, x) => s + x.cpu, 0) / samples.length).toFixed(1),
          cpuPercentMax: Math.max(...samples.map((x) => x.cpu)),
          rssMBMax: Math.max(...samples.map((x) => x.rss)),
          heapMBMax: Math.max(...samples.map((x) => x.heap)),
          maxWorking: Math.max(...samples.map((x) => x.working)),
        }
      : 'admin token not provided',
    errors: errors.slice(0, 50),
    errorCount: errors.length,
  };
  console.log('\nResult:\n' + JSON.stringify(result, null, 2));
  const dir = path.resolve(process.cwd(), '../../loadtest-results');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `loadtest-${CLIENTS}c-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify({ ...result, samples }, null, 2));
  console.log(`\nSaved ${file}`);
  await Promise.all(bots.map((b) => b.stop()));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
