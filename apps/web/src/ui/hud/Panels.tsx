import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, Loader2, MessageCircle, Mic, MicOff, Monitor, Navigation, PenLine, Plus, Trash2, Volume2, VolumeX, WifiOff, X } from 'lucide-react';
import { SEAT_BY_ID, WHITEBOARD_MAX_LENGTH, ZONE_BY_ID } from '@xbrain/shared';
import { useApp } from '../../stores/app';
import { useChat } from '../../stores/chat';
import { useGame } from '../../stores/game';
import { useSettings, keyLabel } from '../../stores/settings';
import { useVoiceStore } from '../../stores/voice';
import { useWorld } from '../../stores/world';
import { runtime } from '../../game/runtime';
import { net } from '../../services/network';
import { formatHMS, workElapsed } from '../../services/clock';
import { useTick } from './Toolbar';

export function InteractionPrompt() {
  const p = useGame((s) => s.prompt);
  return (
    <AnimatePresence mode="wait">
      {p && (
        <motion.div key={p.id + p.verb} initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} className="glass flex items-center gap-3 px-4 py-2.5">
          {p.disabled ? (
            <span className="text-sm font-semibold text-red-300">{p.disabled}</span>
          ) : (
            <span className="flex items-center gap-2 text-sm font-bold tracking-wide">
              <span className="kbd">{p.key}</span> {p.verb}
            </span>
          )}
          {p.secondary && (
            <span className="flex items-center gap-2 border-l border-white/15 pl-3 text-sm font-bold tracking-wide">
              <span className="kbd">{p.secondary.key}</span> {p.secondary.verb}
            </span>
          )}
          <span className="text-xs text-white/50">{p.label}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const icon = { info: Info, warn: AlertTriangle, error: AlertTriangle, success: CheckCircle2, chat: MessageCircle };
  const color = { info: 'text-sky-300', warn: 'text-amber-300', error: 'text-red-400', success: 'text-emerald-300', chat: 'text-pink-300' };
  return (
    <div className="flex flex-col gap-1.5">
      <AnimatePresence>
        {toasts.map((t) => {
          const I = icon[t.level];
          return (
            <motion.div key={t.id} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="glass pointer-events-auto flex items-start gap-2 px-3 py-2 text-sm" onClick={() => useGame.getState().dismissToast(t.id)}>
              <I className={`mt-0.5 h-4 w-4 shrink-0 ${color[t.level]}`} />
              <div>
                {t.title && <div className="text-xs font-bold text-white/70">{t.title}</div>}
                <div className="text-white/90">{t.text}</div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function OnlineList() {
  const open = useGame((s) => s.onlineOpen);
  const players = useWorld((s) => s.players);
  const selfSid = useWorld((s) => s.selfSid);
  const speaking = useWorld((s) => s.speaking);
  const { userVolume, localMuted, audible } = useVoiceStore();
  const list = Object.values(players).sort((a, b) => (a.sid === selfSid ? -1 : b.sid === selfSid ? 1 : a.name.localeCompare(b.name)));
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="glass pointer-events-auto w-[320px] p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-extrabold tracking-[0.18em]">PEOPLE ONLINE · {list.length}</div>
            <button className="text-white/50 hover:text-white" onClick={() => useGame.getState().set({ onlineOpen: false })}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="scrollbar-thin max-h-[52vh] space-y-1 overflow-y-auto pr-1">
            {list.map((p) => {
              const self = p.sid === selfSid;
              const vol = userVolume[p.sid] ?? 1;
              return (
                <div key={p.sid} className={`rounded-xl px-2.5 py-2 ${self ? 'bg-brand/15' : 'bg-white/5'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${!p.online ? 'bg-zinc-500' : speaking[p.sid] ? 'animate-pulse bg-emerald-400' : 'bg-emerald-600'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">
                        {p.name} <span className="font-mono text-[10px] text-white/35">#{p.userId.slice(-4)}</span>
                        {self && <span className="ml-1 text-[10px] text-brand">(you)</span>}
                      </div>
                      <div className="truncate text-[11px] text-white/50">
                        {p.working ? `Working · ${SEAT_BY_ID[p.seatId]?.deskId} · ${formatHMS(workElapsed(p))}` : ZONE_BY_ID[p.zone]?.name}
                        {!p.online && ' · reconnecting'}
                      </div>
                    </div>
                    {p.muted ? <MicOff className="h-3.5 w-3.5 text-red-400" /> : p.micOn ? <Mic className={`h-3.5 w-3.5 ${speaking[p.sid] ? 'text-emerald-400' : 'text-white/60'}`} /> : <MicOff className="h-3.5 w-3.5 text-white/25" />}
                  </div>
                  {!self && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <button className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white" title="Private message" onClick={() => (useChat.getState().set({ tab: 'private', privateTo: p.sid }), useGame.getState().set({ chatOpen: true, chatFocused: true }))}>
                        <MessageCircle className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white"
                        title="Walk to this person"
                        onClick={() => {
                          const pos = runtime.remotePos.get(p.sid);
                          if (pos) useGame.getState().set({ navTarget: { label: p.name, points: [{ x: pos.x, z: pos.z }] } });
                        }}
                      >
                        <Navigation className="h-3.5 w-3.5" />
                      </button>
                      <button className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white" title={localMuted[p.sid] ? 'Unmute for me' : 'Mute for me'} onClick={() => useVoiceStore.getState().set({ localMuted: { ...localMuted, [p.sid]: !localMuted[p.sid] } })}>
                        {localMuted[p.sid] ? <VolumeX className="h-3.5 w-3.5 text-red-400" /> : <Volume2 className="h-3.5 w-3.5" />}
                      </button>
                      <input type="range" min={0} max={2} step={0.05} value={vol} className="h-1 flex-1" title={`Voice volume ${Math.round(vol * 100)}%`} onChange={(e) => useVoiceStore.getState().set({ userVolume: { ...userVolume, [p.sid]: Number(e.target.value) } })} />
                      <span className="w-9 text-right font-mono text-[10px] text-white/40">{audible[p.sid] ? `${Math.round(audible[p.sid] * 100)}%` : '—'}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

export function ComputerUI() {
  useTick();
  const open = useGame((s) => s.computerOpen);
  const me = useWorld((s) => (s.selfSid ? s.players[s.selfSid] : undefined));
  const stats = useWorld((s) => s.stats);
  const user = useApp((s) => s.user);
  const key = `xbrain.workspace.${user?.id ?? 'guest'}`;
  const [todos, setTodos] = useState<Todo[]>(() => JSON.parse(localStorage.getItem(`${key}.todos`) ?? '[]'));
  const [notes, setNotes] = useState(() => localStorage.getItem(`${key}.notes`) ?? '');
  const [draft, setDraft] = useState('');
  useEffect(() => localStorage.setItem(`${key}.todos`, JSON.stringify(todos)), [todos, key]);
  useEffect(() => localStorage.setItem(`${key}.notes`, notes), [notes, key]);
  if (!open) return null;
  const close = () => useGame.getState().set({ computerOpen: false });
  const session = me?.working ? workElapsed(me) : 0;
  const today = (stats?.todayMs ?? 0) + Math.max(0, session - (stats?.runningBaseMs ?? 0));
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-6 text-white backdrop-blur-sm" onClick={close}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-[min(900px,96vw)] overflow-hidden rounded-2xl border-[10px] border-[#1b1d22] bg-gradient-to-br from-[#1d2a3f] to-[#0f1622] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between bg-brand px-4 py-1.5 text-xs font-bold text-black">
          <span className="flex items-center gap-2">
            <Monitor className="h-4 w-4" /> XBrain Workspace · {me ? SEAT_BY_ID[me.seatId]?.label : ''}
          </span>
          <span className="font-mono">{new Date().toLocaleTimeString('vi-VN')}</span>
          <button onClick={close} className="rounded p-0.5 hover:bg-black/20">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-4 p-5">
          <div className="space-y-3">
            <div className="rounded-xl bg-white/5 p-3">
              <div className="label">Current session</div>
              <div className="font-mono text-2xl font-bold text-amber-300">{formatHMS(session)}</div>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <div className="label">Today</div>
              <div className="font-mono text-xl font-bold">{formatHMS(today)}</div>
              <div className="text-xs text-white/40">{stats?.sessionsToday ?? 0} session(s)</div>
            </div>
            <div className="rounded-xl bg-white/5 p-3 text-xs text-white/50">Timer runs on the server clock — it is saved even if you close the tab.</div>
          </div>
          <div className="rounded-xl bg-white/5 p-3">
            <div className="label mb-2">To-do</div>
            <div className="flex gap-1.5">
              <input
                className="input py-1.5 text-xs"
                value={draft}
                placeholder="Add a task…"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter' && draft.trim()) {
                    setTodos((t) => [...t, { id: Date.now(), text: draft.trim().slice(0, 120), done: false }]);
                    setDraft('');
                  }
                }}
              />
              <button className="btn-primary px-2" onClick={() => draft.trim() && (setTodos((t) => [...t, { id: Date.now(), text: draft.trim().slice(0, 120), done: false }]), setDraft(''))}>
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="scrollbar-thin mt-2 max-h-[250px] space-y-1 overflow-y-auto">
              {todos.length === 0 && <div className="py-3 text-center text-xs text-white/30">No tasks</div>}
              {todos.map((t) => (
                <div key={t.id} className="group flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-white/5">
                  <input type="checkbox" checked={t.done} onChange={() => setTodos((all) => all.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))} />
                  <span className={`flex-1 ${t.done ? 'text-white/35 line-through' : ''}`}>{t.text}</span>
                  <button className="opacity-0 group-hover:opacity-100" onClick={() => setTodos((all) => all.filter((x) => x.id !== t.id))}>
                    <Trash2 className="h-3.5 w-3.5 text-white/50" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-white/5 p-3">
            <div className="label mb-2">Quick notes</div>
            <textarea className="input scrollbar-thin h-[280px] resize-none text-xs" value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 4000))} onKeyDown={(e) => e.stopPropagation()} placeholder="Notes are stored on this computer." />
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export function WhiteboardUI() {
  const id = useGame((s) => s.whiteboardOpen);
  const remote = useWorld((s) => (id ? s.boards[id] ?? '' : ''));
  const [text, setText] = useState(remote);
  const editing = useRef(false);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!editing.current) setText(remote);
  }, [remote]);
  useEffect(() => {
    if (id) setText(useWorld.getState().boards[id] ?? '');
  }, [id]);
  if (!id) return null;
  const close = () => useGame.getState().set({ whiteboardOpen: null });
  const onChange = (v: string) => {
    setText(v);
    editing.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      net.whiteboard(id, v);
      editing.current = false;
    }, 400);
  };
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" onClick={close}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-[min(760px,96vw)] rounded-2xl border-8 border-zinc-400 bg-[#fbfbfa] p-5 text-zinc-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold">
            <PenLine className="h-5 w-5 text-orange-600" /> Meeting Room Whiteboard
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">Shared live with everyone · {text.length}/{WHITEBOARD_MAX_LENGTH}</span>
            <button className="rounded-lg p-1 hover:bg-zinc-200" onClick={close}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <textarea
          className="h-[340px] w-full resize-none rounded-xl border border-zinc-300 bg-white p-4 font-[cursive] text-lg text-blue-900 outline-none focus:border-orange-500"
          value={text}
          maxLength={WHITEBOARD_MAX_LENGTH}
          autoFocus
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') close();
          }}
        />
      </motion.div>
    </div>
  );
}

export function ConnectionOverlay() {
  const c = useGame((s) => s.connection);
  if (c === 'connected' || c === 'connecting') return null;
  if (c === 'reconnecting')
    return (
      <div className="fixed left-1/2 top-4 z-40 -translate-x-1/2">
        <div className="glass flex items-center gap-2 border-amber-400/40 px-4 py-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-amber-300" /> Connection lost — reconnecting… your seat and work timer are kept.
        </div>
      </div>
    );
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 text-white backdrop-blur-sm">
      <div className="glass w-[420px] p-6 text-center">
        <WifiOff className="mx-auto mb-3 h-10 w-10 text-red-400" />
        <div className="text-lg font-bold">Disconnected from the office</div>
        <p className="mt-1 text-sm text-white/60">Your work session has been saved. You can rejoin at any time.</p>
        <button className="btn-primary mt-5" onClick={() => useApp.getState().set({ phase: 'creator' })}>
          Rejoin
        </button>
      </div>
    </div>
  );
}

export function PerfOverlay() {
  const show = useSettings((s) => s.showFps);
  const [s, setS] = useState({ ...runtime.stats });
  const ping = useGame((g) => g.ping);
  const players = useWorld((w) => Object.keys(w.players).length);
  useEffect(() => {
    if (!show) return;
    const id = setInterval(() => setS({ ...runtime.stats }), 500);
    return () => clearInterval(id);
  }, [show]);
  if (!show) return null;
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return (
    <div className="pointer-events-none fixed right-4 top-20 z-20 rounded-lg bg-black/70 px-3 py-2 font-mono text-[11px] leading-5 text-emerald-300">
      <div>FPS {s.fps.toFixed(0)} · {s.frameMs.toFixed(1)} ms</div>
      <div>Draw calls {s.drawCalls} · Tris {(s.triangles / 1000).toFixed(0)}k</div>
      <div>Players {players} · Ping {ping} ms</div>
      {mem && <div>JS heap {(mem.usedJSHeapSize / 1048576).toFixed(0)} MB</div>}
      <div>Quality {useSettings.getState().quality}</div>
    </div>
  );
}

export function PointerHint() {
  const mode = useGame((s) => s.cameraMode);
  const locked = useGame((s) => s.pointerLocked);
  const keys = useSettings((s) => s.keys);
  if (mode === 'first' && !locked)
    return (
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-black/50 px-4 py-2 text-sm text-white/80 backdrop-blur">
        Click to look around · <span className="kbd">Esc</span> to release · <span className="kbd">{keyLabel(keys.camera)}</span> third person
      </div>
    );
  if (mode === 'first' && locked) return <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" />;
  if (mode === 'third')
    return (
      <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-black/30 px-3 py-1 text-[11px] text-white/50 backdrop-blur">
        <span className="kbd">W</span>
        <span className="kbd">A</span>
        <span className="kbd">S</span>
        <span className="kbd">D</span> move · drag to look · <span className="kbd">{keyLabel(keys.run)}</span> run · <span className="kbd">{keyLabel(keys.interact)}</span> interact · <span className="kbd">{keyLabel(keys.chat)}</span> chat
      </div>
    );
  return null;
}
