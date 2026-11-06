import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Armchair, Briefcase, Camera, EyeOff, LayoutDashboard, Map as MapIcon, Mic, MicOff, Radio, Smile } from 'lucide-react';
import { CAMERA_PRESETS, DESKS, EMOTES, EMOTE_ICONS, EMOTE_LABELS, SEAT_BY_ID } from '@xbrain/shared';
import { useGame, type CameraMode } from '../../stores/game';
import { useSettings, keyLabel } from '../../stores/settings';
import { useVoiceStore } from '../../stores/voice';
import { useWorld } from '../../stores/world';
import { net } from '../../services/network';
import { voice } from '../../services/voice';
import { formatHMS, workElapsed } from '../../services/clock';
import { runtime } from '../../game/runtime';

export function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

function WorkWidget() {
  useTick();
  const seatId = useGame((s) => s.seatId);
  const phase = useGame((s) => s.seatPhase);
  const me = useWorld((s) => (s.selfSid ? s.players[s.selfSid] : undefined));
  const seats = useWorld((s) => s.seats);
  const seat = seatId ? SEAT_BY_ID[seatId] : undefined;

  if (phase === 'seated' || phase === 'sitting') {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-white/5 py-1 pl-3 pr-1">
        <div className="text-left leading-tight">
          <div className={`text-[10px] font-bold tracking-wider ${me?.working ? 'text-amber-300' : 'text-white/60'}`}>{me?.working ? '● WORKING' : 'SEATED'}</div>
          <div className="font-mono text-sm font-bold">{me?.working ? formatHMS(workElapsed(me)) : seat?.label}</div>
        </div>
        <button className="btn-primary h-10 px-3 text-xs tracking-wider" onClick={() => net.stand()}>
          <Armchair className="h-4 w-4" /> STAND UP
        </button>
      </div>
    );
  }
  const findDesk = () => {
    const L = runtime.local.pos;
    const free = DESKS.filter((d) => !seats[d.seatId]).map((d) => SEAT_BY_ID[d.seatId]);
    if (!free.length) return useGame.getState().toast('warn', 'All 50 desks are taken right now.');
    free.sort((a, b) => Math.hypot(a.x - L.x, a.z - L.z) - Math.hypot(b.x - L.x, b.z - L.z));
    const s = free[0];
    useGame.getState().set({ navTarget: { label: s.label, points: [{ x: s.stand.x, z: s.stand.z }] } });
    useGame.getState().toast('info', `Follow the orange line to ${s.label}, then press E to sit.`);
  };
  return (
    <button className="tool-btn w-[92px]" onClick={findDesk} disabled={phase !== 'none'} title="Navigate to the nearest free desk">
      <Briefcase className="h-5 w-5" />
      Find desk
    </button>
  );
}

function MicButton() {
  const { status, statusText, micOn, pttHeld, inputLevel } = useVoiceStore();
  const ptt = useSettings((s) => s.pushToTalk);
  const keys = useSettings((s) => s.keys);
  const speaking = useWorld((s) => (s.selfSid ? !!s.speaking[s.selfSid] : false));
  const unavailable = status !== 'connected';
  const title = unavailable ? statusText || 'Voice not connected' : ptt ? `Push-to-talk: hold ${keyLabel(keys.ptt)}` : `Toggle microphone (${keyLabel(keys.mic)})`;
  return (
    <button
      className={`tool-btn ${micOn ? 'tool-btn-active' : ''} ${unavailable ? 'opacity-50' : ''}`}
      title={title}
      onClick={() => {
        if (unavailable) {
          if (status === 'error') void voice.connect();
          useGame.getState().toast('warn', statusText || 'Voice is not connected.');
          return;
        }
        if (ptt) return useGame.getState().toast('info', `Push-to-talk is on — hold ${keyLabel(keys.ptt)} to speak.`);
        void voice.setMic(!micOn);
      }}
    >
      {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
      {ptt ? (pttHeld ? 'Talking' : `PTT ${keyLabel(keys.ptt)}`) : micOn ? 'Mic on' : 'Mic off'}
      {(speaking || inputLevel > 0.1) && micOn && <span className="absolute right-1.5 top-1.5 h-2 w-2 animate-ping rounded-full bg-emerald-400" />}
      {unavailable && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-red-400" />}
    </button>
  );
}

function EmoteMenu() {
  const open = useGame((s) => s.emoteOpen);
  return (
    <div className="relative">
      <button className={`tool-btn ${open ? 'tool-btn-active' : ''}`} onClick={() => useGame.getState().set({ emoteOpen: !open })} title="Emotes (G)">
        <Smile className="h-5 w-5" />
        Emotes
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="glass absolute bottom-16 left-1/2 grid w-[300px] -translate-x-1/2 grid-cols-4 gap-1 p-2">
            {EMOTES.map((e, i) => (
              <button
                key={e}
                className="flex flex-col items-center rounded-xl p-2 text-xs hover:bg-white/15"
                onClick={() => {
                  net.emote(e);
                  useGame.getState().set({ emoteOpen: false });
                }}
              >
                <span className="text-2xl">{EMOTE_ICONS[e]}</span>
                <span className="mt-0.5 text-white/80">{EMOTE_LABELS[e]}</span>
                <span className="font-mono text-[10px] text-white/40">{i + 1}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CameraMenu() {
  const mode = useGame((s) => s.cameraMode);
  const preset = useGame((s) => s.cameraPreset);
  const [open, setOpen] = useState(false);
  const modes: Array<{ id: CameraMode; label: string }> = [
    { id: 'third', label: 'Third person' },
    { id: 'first', label: 'First person' },
    { id: 'overview', label: 'Office overview' },
  ];
  return (
    <div className="relative">
      <button className={`tool-btn ${open ? 'tool-btn-active' : ''}`} onClick={() => setOpen((v) => !v)} title="Camera (C)">
        <Camera className="h-5 w-5" />
        {mode === 'third' ? '3rd' : mode === 'first' ? '1st' : mode === 'overview' ? 'Overview' : 'Room'}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="glass absolute bottom-16 left-1/2 w-[230px] -translate-x-1/2 p-2 text-sm">
            <div className="label px-2 pb-1">View</div>
            {modes.map((m) => (
              <button key={m.id} className={`block w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/10 ${mode === m.id ? 'text-brand' : ''}`} onClick={() => (useGame.getState().setCamera(m.id), setOpen(false))}>
                {m.label}
              </button>
            ))}
            <div className="label px-2 pb-1 pt-2">Room cameras</div>
            {CAMERA_PRESETS.filter((p) => p.id !== 'overview').map((p) => (
              <button key={p.id} className={`block w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/10 ${mode === 'preset' && preset === p.id ? 'text-brand' : ''}`} onClick={() => (useGame.getState().setCamera('preset', p.id), setOpen(false))}>
                {p.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Toolbar() {
  const dashboard = useGame((s) => s.dashboardOpen);
  const mode = useGame((s) => s.cameraMode);
  return (
    <div className="glass pointer-events-auto flex items-center gap-1 p-1.5">
      <WorkWidget />
      <div className="mx-1 h-8 w-px bg-white/10" />
      <MicButton />
      <EmoteMenu />
      <CameraMenu />
      <button className="tool-btn" onClick={() => useGame.getState().set({ mapOpen: true })} title="Office map (M)">
        <MapIcon className="h-5 w-5" />
        Map
      </button>
      <button className={`tool-btn ${dashboard ? 'tool-btn-active' : ''}`} onClick={() => useGame.getState().set({ dashboardOpen: !dashboard })} title="Office status (B)">
        <LayoutDashboard className="h-5 w-5" />
        Status
      </button>
      <button className="tool-btn" onClick={() => useGame.getState().set({ hudHidden: true })} title="Hide UI for screenshots (H)">
        <EyeOff className="h-5 w-5" />
        Hide UI
      </button>
      {(mode === 'overview' || mode === 'preset') && (
        <button className="btn-primary ml-1 h-11 text-xs" onClick={() => useGame.getState().setCamera(useGame.getState().followMode)}>
          <Radio className="h-4 w-4" /> Back to avatar
        </button>
      )}
    </div>
  );
}
