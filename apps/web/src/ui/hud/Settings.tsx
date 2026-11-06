import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Keyboard, Mic, Monitor, Sliders, User, Volume2, X } from 'lucide-react';
import { DEFAULT_VOICE_RANGES } from '@xbrain/shared';
import { useApp } from '../../stores/app';
import { useGame } from '../../stores/game';
import { KEY_ACTIONS, KEY_ACTION_LABELS, keyLabel, useSettings, type KeyAction } from '../../stores/settings';
import { useVoiceStore } from '../../stores/voice';
import { useWorld } from '../../stores/world';
import { input } from '../../game/controls/input';
import { voice } from '../../services/voice';

const TABS = [
  { id: 'graphics', label: 'Graphics', icon: Monitor },
  { id: 'controls', label: 'Controls', icon: Keyboard },
  { id: 'audio', label: 'Sound', icon: Volume2 },
  { id: 'mic', label: 'Microphone', icon: Mic },
  { id: 'voice', label: 'Voice range', icon: Sliders },
  { id: 'avatar', label: 'Avatar', icon: User },
] as const;

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-white/5 py-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-white/45">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className={`relative h-6 w-11 rounded-full transition ${value ? 'bg-brand' : 'bg-white/20'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${value ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

function Slider({ value, min, max, step, onChange, fmt }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <div className="flex w-56 items-center gap-2">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1" />
      <span className="w-12 text-right font-mono text-xs text-white/60">{fmt ? fmt(value) : value}</span>
    </div>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-xl bg-white/5 p-0.5">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${value === v ? 'bg-brand text-black' : 'text-white/70 hover:text-white'}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

function KeyBindings() {
  const keys = useSettings((s) => s.keys);
  const [capture, setCapture] = useState<KeyAction | null>(null);
  useEffect(() => {
    if (!capture) return;
    input.capturing = true;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== 'Escape' || capture === 'menu') useSettings.getState().setKey(capture, e.code);
      setCapture(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      input.capturing = false;
      window.removeEventListener('keydown', onKey, true);
    };
  }, [capture]);
  return (
    <div>
      <div className="grid grid-cols-2 gap-x-6">
        {KEY_ACTIONS.map((a) => (
          <div key={a} className="flex items-center justify-between border-b border-white/5 py-2 text-sm">
            <span className="text-white/80">{KEY_ACTION_LABELS[a]}</span>
            <button className={`kbd min-w-[64px] ${capture === a ? 'animate-pulse border-brand text-brand' : ''}`} onClick={() => setCapture(a)}>
              {capture === a ? 'Press…' : keyLabel(keys[a])}
            </button>
          </div>
        ))}
      </div>
      <button className="btn-ghost mt-4" onClick={() => useSettings.getState().resetKeys()}>
        Reset to defaults
      </button>
    </div>
  );
}

function MicSettings() {
  const s = useSettings();
  const { devices, inputLevel, permission, status, statusText } = useVoiceStore();
  const [testing, setTesting] = useState(false);
  const [loop, setLoop] = useState(false);
  useEffect(() => () => voice.stopMicTest(), []);
  useEffect(() => {
    void voice.refreshDevices();
  }, []);
  return (
    <div>
      <div className={`mb-3 rounded-xl px-3 py-2 text-xs ${status === 'connected' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>
        Voice server: {status === 'connected' ? 'connected (LiveKit SFU, proximity audio)' : statusText || status}
      </div>
      <Row label="Input device" hint={permission === 'denied' ? 'Microphone permission denied in the browser' : 'Microphone used for voice chat'}>
        <select className="input w-64 py-1.5 text-xs" value={s.micDeviceId} onChange={(e) => void voice.switchDevice(e.target.value)}>
          <option value="">System default</option>
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Push-to-talk" hint={`Hold ${keyLabel(s.keys.ptt)} to speak instead of an always-on mic`}>
        <Toggle
          value={s.pushToTalk}
          onChange={(v) => {
            s.set({ pushToTalk: v });
            if (v) void voice.setMic(false);
          }}
        />
      </Row>
      <Row label="Noise suppression">
        <Toggle value={s.noiseSuppression} onChange={(v) => s.set({ noiseSuppression: v })} />
      </Row>
      <Row label="Echo cancellation">
        <Toggle value={s.echoCancellation} onChange={(v) => s.set({ echoCancellation: v })} />
      </Row>
      <Row label="Microphone test" hint="Speak to see the level. Enable loopback to hear yourself (use headphones).">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-white/60">
            <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> loopback
          </label>
          <button
            className={testing ? 'btn-danger' : 'btn-ghost'}
            onClick={async () => {
              if (testing) {
                voice.stopMicTest();
                setTesting(false);
              } else setTesting(await voice.startMicTest(loop));
            }}
          >
            {testing ? 'Stop' : 'Test mic'}
          </button>
        </div>
      </Row>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-lime-400 to-amber-400 transition-[width] duration-75" style={{ width: `${Math.round(inputLevel * 100)}%` }} />
      </div>
    </div>
  );
}

export function SettingsModal() {
  const tab = useGame((s) => s.settingsTab);
  const s = useSettings();
  const close = () => useGame.getState().set({ settingsOpen: false });
  const serverConfig = useApp((a) => a.serverConfig);
  const ping = useGame((g) => g.ping);
  const players = useWorld((w) => Object.keys(w.players).length);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-6 text-white backdrop-blur-sm" onClick={close}>
      <motion.div initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} className="glass flex h-[min(640px,92vh)] w-[min(920px,96vw)] overflow-hidden p-0" onClick={(e) => e.stopPropagation()}>
        <div className="w-52 shrink-0 border-r border-white/10 p-3">
          <div className="mb-3 px-2 text-xs font-extrabold tracking-[0.2em] text-white/60">SETTINGS</div>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => useGame.getState().set({ settingsTab: t.id })} className={`mb-0.5 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm ${tab === t.id ? 'bg-brand text-black' : 'text-white/75 hover:bg-white/10'}`}>
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
          <div className="mt-6 space-y-0.5 px-2 text-[11px] text-white/40">
            <div>Server: {serverConfig?.name}</div>
            <div>Storage: {serverConfig?.store}</div>
            <div>
              Ping {ping} ms · {players} online
            </div>
          </div>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto p-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-bold">{TABS.find((t) => t.id === tab)?.label}</h2>
            <button className="btn-ghost" onClick={close}>
              <X className="h-4 w-4" />
            </button>
          </div>
          {tab === 'graphics' && (
            <>
              <Row label="Graphics quality" hint="Low: no shadows, lower resolution · High: soft shadows on avatars, full resolution">
                <Seg value={s.quality} options={[['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]} onChange={(v) => s.set({ quality: v })} />
              </Row>
              <Row label="Time of day" hint="Lighting & Thuận Phước bridge view (auto follows your clock)">
                <Seg value={s.timeOfDay} options={[['auto', 'Auto'], ['day', 'Day'], ['sunset', 'Sunset'], ['night', 'Night']]} onChange={(v) => s.set({ timeOfDay: v })} />
              </Row>
              <Row label="Field of view">
                <Slider value={s.fov} min={45} max={90} step={1} onChange={(v) => s.set({ fov: v })} fmt={(v) => `${v}°`} />
              </Row>
              <Row label="Show name tags">
                <Toggle value={s.showNames} onChange={(v) => s.set({ showNames: v })} />
              </Row>
              <Row label="Collide with other avatars" hint="Prevents walking through people">
                <Toggle value={s.avatarCollision} onChange={(v) => s.set({ avatarCollision: v })} />
              </Row>
              <Row label="Desk camera when sitting">
                <Toggle value={s.autoDeskCamera} onChange={(v) => s.set({ autoDeskCamera: v })} />
              </Row>
              <Row label="Performance monitor" hint={`FPS, draw calls, triangles (${keyLabel(s.keys.perf)})`}>
                <Toggle value={s.showFps} onChange={(v) => s.set({ showFps: v })} />
              </Row>
            </>
          )}
          {tab === 'controls' && (
            <>
              <Row label="Camera sensitivity">
                <Slider value={s.mouseSensitivity} min={0.2} max={3} step={0.05} onChange={(v) => s.set({ mouseSensitivity: v })} fmt={(v) => `${v.toFixed(2)}×`} />
              </Row>
              <Row label="Invert vertical look">
                <Toggle value={s.invertY} onChange={(v) => s.set({ invertY: v })} />
              </Row>
              <div className="mt-5">
                <div className="label mb-2">Key bindings (click to rebind)</div>
                <KeyBindings />
              </div>
            </>
          )}
          {tab === 'audio' && (
            <>
              <Row label="Master volume">
                <Slider value={s.masterVolume} min={0} max={1} step={0.01} onChange={(v) => (s.set({ masterVolume: v }), voice.applyVolume())} fmt={(v) => `${Math.round(v * 100)}%`} />
              </Row>
              <Row label="Voice chat volume">
                <Slider value={s.voiceVolume} min={0} max={1.5} step={0.01} onChange={(v) => (s.set({ voiceVolume: v }), voice.applyVolume())} fmt={(v) => `${Math.round(v * 100)}%`} />
              </Row>
              <Row label="Effects volume" hint="Doors, chat notifications, coffee machine">
                <Slider value={s.effectsVolume} min={0} max={1} step={0.01} onChange={(v) => s.set({ effectsVolume: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
              </Row>
            </>
          )}
          {tab === 'mic' && <MicSettings />}
          {tab === 'voice' && (
            <>
              <p className="mb-2 text-sm text-white/60">Proximity voice: people are heard clearly up to the first distance, fade between bands, and are silent beyond the last one. Closed rooms (meeting, kitchen, director) block most sound unless the door is open.</p>
              <Row label="Clear up to">
                <Slider value={s.voiceRanges.full} min={1} max={6} step={0.5} onChange={(v) => s.set({ voiceRanges: { ...s.voiceRanges, full: v, mid: Math.max(v + 0.5, s.voiceRanges.mid) } })} fmt={(v) => `${v} m`} />
              </Row>
              <Row label="Fading until">
                <Slider value={s.voiceRanges.mid} min={2} max={12} step={0.5} onChange={(v) => s.set({ voiceRanges: { ...s.voiceRanges, mid: Math.max(v, s.voiceRanges.full + 0.5), far: Math.max(v + 0.5, s.voiceRanges.far) } })} fmt={(v) => `${v} m`} />
              </Row>
              <Row label="Silent beyond">
                <Slider value={s.voiceRanges.far} min={4} max={20} step={0.5} onChange={(v) => s.set({ voiceRanges: { ...s.voiceRanges, far: Math.max(v, s.voiceRanges.mid + 0.5) } })} fmt={(v) => `${v} m`} />
              </Row>
              <button className="btn-ghost mt-4" onClick={() => s.set({ voiceRanges: DEFAULT_VOICE_RANGES })}>
                Reset (3 / 7 / 12 m)
              </button>
            </>
          )}
          {tab === 'avatar' && (
            <div className="space-y-3">
              <p className="text-sm text-white/60">Change your name, hairstyle, outfit and accessories. Changes are saved to your profile and synced to everyone in real time.</p>
              <button className="btn-primary" onClick={() => (close(), useApp.getState().set({ editingInGame: true }))}>
                <User className="h-4 w-4" /> Open avatar editor
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
