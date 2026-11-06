/** Colyseus connection: joins the office, mirrors replicated state, routes messages, reconnects. */
import { Client, type Room } from 'colyseus.js';
import {
  C2S,
  RECONNECT_GRACE_SECONDS,
  S2C,
  SEAT_BY_ID,
  SPEECH_BUBBLE_MS,
  type ChatMsg,
  type ChatSendMsg,
  type EmoteMsg,
  type EmoteName,
  type InteractMsg,
  type NoticeMsg,
  type SeatResultMsg,
  type SnapshotMsg,
  type StatsMsg,
  type ZoneId,
} from '@xbrain/shared';
import { useApp } from '../stores/app';
import { useChat } from '../stores/chat';
import { useGame } from '../stores/game';
import { parseAvatar, useWorld, type PlayerView } from '../stores/world';
import { getBuffer, runtime } from '../game/runtime';
import { addClockSample, setRoughOffset } from './clock';
import { serverWsUrl } from './api';
import { sfx } from './sfx';
import { voice } from './voice';

type AnyState = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const RECONNECT_KEY = 'xbrain.reconnect';

class Network {
  client: Client | null = null;
  room: Room<AnyState> | null = null;
  private leaving = false;
  private pingTimer: number | null = null;
  private statsTimer: number | null = null;
  private flushScheduled = false;
  private dirtyPlayers = new Set<string>();
  private dirtyMaps = new Set<'seats' | 'objects' | 'boards'>();
  private removed = new Set<string>();
  private pingSeq = 0;
  private pingSent = new Map<number, number>();

  get sessionId() {
    return this.room?.sessionId ?? null;
  }

  async join(roomId: string, token: string) {
    this.client = new Client(serverWsUrl());
    this.leaving = false;
    useGame.getState().set({ connection: 'connecting' });
    // Page reload within the grace period → try to resume the same session (seat & timer kept).
    const saved = this.readSaved();
    if (saved && saved.roomId === roomId) {
      try {
        const room = await this.client.reconnect(saved.token);
        this.attach(room);
        useGame.getState().toast('success', 'Session restored — welcome back!');
        return room;
      } catch {
        sessionStorage.removeItem(RECONNECT_KEY);
      }
    }
    const room = await this.client.joinById(roomId, { token, v: '1.0.0' });
    this.attach(room);
    return room;
  }

  private readSaved(): { roomId: string; token: string; at: number } | null {
    try {
      const v = JSON.parse(sessionStorage.getItem(RECONNECT_KEY) ?? 'null');
      if (v && Date.now() - v.at < (RECONNECT_GRACE_SECONDS - 5) * 1000) return v;
    } catch {
      /* ignore */
    }
    return null;
  }

  private saveReconnect() {
    if (!this.room) return;
    sessionStorage.setItem(RECONNECT_KEY, JSON.stringify({ roomId: this.room.roomId, token: this.room.reconnectionToken, at: Date.now() }));
  }

  private attach(room: Room<AnyState>) {
    this.room = room;
    const world = useWorld.getState();
    world.reset();
    useWorld.getState().set({ selfSid: room.sessionId });
    runtime.buffers.clear();
    runtime.remotePos.clear();
    useGame.getState().set({ connection: 'connected' });
    this.saveReconnect();
    window.addEventListener('beforeunload', this.onUnload);

    const $ = room.state;
    $.players.onAdd((p: AnyState, sid: string) => {
      this.dirtyPlayers.add(sid);
      this.removed.delete(sid);
      this.scheduleFlush();
      p.onChange(() => {
        this.dirtyPlayers.add(sid);
        this.scheduleFlush();
      });
      if (sid !== room.sessionId && useWorld.getState().players[room.sessionId]) {
        // Not during the initial sync.
        useChat.getState().system(`${p.name} joined the office.`);
      }
    });
    $.players.onRemove((p: AnyState, sid: string) => {
      this.removed.add(sid);
      this.dirtyPlayers.delete(sid);
      runtime.buffers.delete(p.idx);
      runtime.remotePos.delete(sid);
      this.scheduleFlush();
      if (sid !== room.sessionId) useChat.getState().system(`${p.name} left the office.`);
    });
    for (const key of ['seats', 'objects', 'boards'] as const) {
      const mark = () => {
        this.dirtyMaps.add(key);
        this.scheduleFlush();
      };
      $[key].onAdd(mark);
      $[key].onRemove(mark);
      $[key].onChange(mark);
    }
    $.listen('capacity', (v: number) => useWorld.getState().set({ capacity: v }));
    $.listen('allowTeleport', (v: boolean) => useWorld.getState().set({ allowTeleport: v }));
    $.listen('officeName', (v: string) => useWorld.getState().set({ officeName: v }));

    room.onMessage(S2C.Snapshot, (m: SnapshotMsg) => {
      const t = Number(m.t);
      setRoughOffset(t);
      for (const [idx, x, y, z, r, a] of m.p) getBuffer(idx).push({ t, x: x / 100, y: y / 100, z: z / 100, r: r / 1000, a });
    });
    room.onMessage(S2C.Pong, (m: { t: number; s: number }) => {
      const sentAt = this.pingSent.get(m.t);
      if (sentAt === undefined) return;
      this.pingSent.delete(m.t);
      addClockSample(sentAt, Number(m.s));
      useGame.getState().set({ ping: Date.now() - sentAt });
    });
    room.onMessage(S2C.Correction, (m: { x: number; y: number; z: number }) => {
      runtime.local.teleport = { x: m.x, y: m.y, z: m.z };
    });
    room.onMessage(S2C.Teleported, (m: { x: number; y: number; z: number; rotY: number; reason: string }) => {
      runtime.local.teleport = { x: m.x, y: m.y, z: m.z, rotY: m.rotY };
      if (m.reason === 'teleport') useGame.getState().set({ navTarget: null });
    });
    room.onMessage(S2C.Chat, (m: ChatMsg) => this.onChat(m));
    room.onMessage(S2C.Emote, (m: EmoteMsg) => {
      const until = performance.now() + (m.name === 'dance' ? 6000 : 2400);
      if (m.sid === room.sessionId) runtime.local.emote = { name: m.name, until };
      else runtime.remoteEmotes.set(m.sid, { name: m.name, until });
    });
    room.onMessage(S2C.Stats, (m: StatsMsg) => useWorld.getState().set({ stats: m, statsAt: Date.now() }));
    room.onMessage(S2C.Notice, (m: NoticeMsg) => {
      useGame.getState().toast(m.level === 'error' ? 'error' : m.level === 'warn' ? 'warn' : 'info', m.text);
      if (m.code === 'kicked' || m.code === 'replaced') this.leaving = true;
    });
    room.onMessage(S2C.SeatResult, (m: SeatResultMsg) => this.onSeatResult(m));
    room.onLeave((code: number) => this.onLeave(code));
    room.onError((code: number, message?: string) => console.warn('[net] room error', code, message));

    this.startTimers();
    voice.onJoined(room.sessionId);
  }

  private onUnload = () => {
    // Keep the reconnection token so a quick reload resumes the session.
    this.saveReconnect();
  };

  private startTimers() {
    this.stopTimers();
    let n = 0;
    const ping = () => {
      const seq = ++this.pingSeq % 1_000_000;
      this.pingSent.set(seq, Date.now());
      if (this.pingSent.size > 20) this.pingSent.delete(this.pingSent.keys().next().value!);
      this.send(C2S.Ping, { t: seq });
      n++;
      this.pingTimer = window.setTimeout(ping, n < 6 ? 1000 : 5000);
    };
    ping();
    const stats = () => this.send(C2S.MyStats, {});
    stats();
    this.statsTimer = window.setInterval(stats, 30_000);
  }

  private stopTimers() {
    if (this.pingTimer) clearTimeout(this.pingTimer);
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.pingTimer = this.statsTimer = null;
  }

  private scheduleFlush() {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    setTimeout(() => this.flush(), 50);
  }

  private flush() {
    this.flushScheduled = false;
    const room = this.room;
    if (!room) return;
    const $ = room.state;
    const world = useWorld.getState();
    const patch: Partial<ReturnType<typeof useWorld.getState>> = {};
    if (this.dirtyPlayers.size || this.removed.size) {
      const players = { ...world.players };
      for (const sid of this.removed) delete players[sid];
      for (const sid of this.dirtyPlayers) {
        const p = $.players.get(sid);
        if (!p) continue;
        const prev = players[sid];
        const avatar = prev && prev.avatarKey === p.avatar ? prev.avatar : parseAvatar(p.avatar);
        players[sid] = {
          sid,
          idx: p.idx,
          userId: p.userId,
          name: p.name,
          avatar,
          avatarKey: p.avatar,
          role: p.role,
          seatId: p.seatId,
          working: p.working,
          workSegmentStart: p.workSegmentStart,
          workAccumMs: p.workAccumMs,
          online: p.online,
          micOn: p.micOn,
          muted: p.muted,
          zone: p.zone as ZoneId,
          joinedAt: p.joinedAt,
        } satisfies PlayerView;
      }
      patch.players = players;
      this.dirtyPlayers.clear();
      this.removed.clear();
    }
    for (const key of this.dirtyMaps) {
      const obj: Record<string, never> = {};
      $[key].forEach((v: never, k: string) => (obj[k] = v));
      (patch as Record<string, unknown>)[key] = obj;
    }
    this.dirtyMaps.clear();
    world.set(patch);
    this.syncLocalSeat();
  }

  /** Keep local seat state consistent with the authoritative seat map (e.g. after reconnect). */
  private syncLocalSeat() {
    const sid = this.sessionId;
    const g = useGame.getState();
    const me = sid ? useWorld.getState().players[sid] : undefined;
    if (!me) return;
    if (me.seatId && g.seatId !== me.seatId && g.seatPhase !== 'sitting') {
      g.set({ seatId: me.seatId, seatPhase: 'seated' });
    } else if (!me.seatId && g.seatId && g.seatPhase === 'seated') {
      g.set({ seatId: null, seatPhase: 'none' });
    }
  }

  private onChat(m: ChatMsg) {
    const chat = useChat.getState();
    chat.add(m);
    const self = m.from === this.sessionId;
    if (m.channel === 'nearby' || m.channel === 'meeting') {
      chat.set({ bubbles: { ...useChat.getState().bubbles, [m.from]: { text: m.text, until: performance.now() + SPEECH_BUBBLE_MS } } });
      if (self) runtime.local.talkingUntil = performance.now() + 2500;
    }
    if (!self) {
      const g = useGame.getState();
      if (!g.chatOpen || chat.tab !== (m.channel === 'system' ? chat.tab : m.channel)) chat.set({ unread: useChat.getState().unread + 1 });
      if (m.channel === 'private') {
        g.toast('chat', m.text, `Private · ${m.fromName}`);
        sfx.notify();
      } else sfx.chat();
    }
  }

  private onSeatResult(m: SeatResultMsg) {
    const g = useGame.getState();
    if (!m.ok) {
      if (m.reason) g.toast('warn', m.reason);
      sfx.error();
      if (m.action === 'sit') g.set({ seatPhase: g.seatId ? 'seated' : 'none' });
      else if (g.seatId) g.set({ seatPhase: 'seated' });
      return;
    }
    if (m.action === 'sit') {
      g.set({ seatId: m.seatId, seatPhase: 'sitting' });
      sfx.sit();
      const seat = SEAT_BY_ID[m.seatId];
      if (seat?.kind === 'desk') g.toast('success', `Working session started at ${seat.label}.`);
    } else {
      g.set({ seatPhase: 'standing' });
      this.send(C2S.MyStats, {});
    }
  }

  private async onLeave(code: number) {
    this.stopTimers();
    voice.disconnect();
    window.removeEventListener('beforeunload', this.onUnload);
    const g = useGame.getState();
    if (this.leaving || code === 1000 || code === 4000 || code === 4001 || code === 4003 || code === 4008) {
      sessionStorage.removeItem(RECONNECT_KEY);
      g.set({ connection: 'disconnected' });
      return;
    }
    // Unexpected drop → reconnect within the server's grace window.
    g.set({ connection: 'reconnecting' });
    const token = this.room?.reconnectionToken;
    const deadline = Date.now() + (RECONNECT_GRACE_SECONDS - 2) * 1000;
    let delay = 800;
    while (token && Date.now() < deadline && !this.leaving) {
      await new Promise((r) => setTimeout(r, delay));
      try {
        const room = await this.client!.reconnect(token);
        this.attach(room);
        g.toast('success', 'Reconnected to the office.');
        return;
      } catch {
        delay = Math.min(4000, delay * 1.5);
      }
    }
    g.set({ connection: 'disconnected' });
  }

  send(type: string, msg: unknown) {
    if (this.room && this.room.connection.isOpen) this.room.send(type, msg);
  }

  sendMove(x: number, y: number, z: number, r: number, a: number) {
    this.send(C2S.Move, { x: +x.toFixed(3), y: +y.toFixed(3), z: +z.toFixed(3), r: +r.toFixed(3), a });
  }

  sit(seatId: string) {
    useGame.getState().set({ seatPhase: 'requesting' });
    this.send(C2S.Sit, { seatId });
  }

  stand() {
    this.send(C2S.Stand, {});
  }

  chat(msg: ChatSendMsg) {
    this.send(C2S.Chat, msg);
  }

  emote(name: EmoteName) {
    this.send(C2S.Emote, { name });
  }

  interact(id: string, action?: string) {
    this.send(C2S.Interact, { id, action } satisfies InteractMsg);
  }

  whiteboard(id: string, text: string) {
    this.send(C2S.Whiteboard, { id, text });
  }

  teleport(zone: ZoneId) {
    this.send(C2S.Teleport, { zone });
  }

  voiceState(micOn: boolean) {
    this.send(C2S.VoiceState, { micOn });
  }

  avatarUpdated() {
    this.send(C2S.AvatarUpdated, {});
  }

  async leave() {
    this.leaving = true;
    sessionStorage.removeItem(RECONNECT_KEY);
    voice.disconnect();
    await this.room?.leave(true).catch(() => undefined);
    this.room = null;
  }
}

export const net = new Network();

/** Resolve the office room and join it. Returns false if full. */
export async function joinOffice(): Promise<'ok' | 'full'> {
  const app = useApp.getState();
  const { api } = await import('./api');
  const office = await api.office();
  useApp.getState().set({ office });
  if (!office.roomId) throw new Error('Office room unavailable');
  if (office.online >= office.capacity && !sessionStorage.getItem(RECONNECT_KEY)) return 'full';
  try {
    await net.join(office.roomId, app.token!);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/locked|full|maxClients/i.test(msg)) return 'full';
    throw e;
  }
  return 'ok';
}
