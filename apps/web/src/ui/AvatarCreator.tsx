import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Dices, Loader2, LogIn, RotateCw, Save, X } from 'lucide-react';
import {
  AVATAR_PRESETS,
  BEARDS,
  BODY_TYPES,
  BOTTOM_STYLES,
  CLOTH_COLORS,
  DEFAULT_AVATAR,
  FACE_TYPES,
  GLASSES,
  HAIR_COLORS,
  HAIR_STYLES,
  HEADWEAR,
  NAME_MAX_LENGTH,
  SHOE_STYLES,
  SKIN_TONES,
  TOP_STYLES,
  randomAvatar,
  sanitizeAvatar,
  sanitizeName,
  type AvatarConfig,
} from '@xbrain/shared';
import { useApp } from '../stores/app';
import { useGame } from '../stores/game';
import { api } from '../services/api';
import { net } from '../services/network';
import { audioCtx } from '../services/sfx';
import { AvatarPreview, type PreviewAnim } from './AvatarPreview';
import { Logo } from './LoadingScreen';

const LABELS: Record<string, string> = {
  masc: 'Masculine', fem: 'Feminine', neutral: 'Neutral',
  friendly: 'Friendly', calm: 'Calm', bright: 'Bright', serious: 'Serious', cheerful: 'Cheerful',
  short: 'Short', buzz: 'Buzz cut', side: 'Side part', long: 'Long', bob: 'Bob', bun: 'Bun', ponytail: 'Ponytail', curly: 'Curly', mohawk: 'Mohawk', bald: 'Bald',
  shirt: 'Shirt', tshirt: 'T-shirt', polo: 'Polo', hoodie: 'Hoodie', blazer: 'Blazer',
  pants: 'Pants', shorts: 'Shorts', skirt: 'Skirt',
  sneakers: 'Sneakers', formal: 'Formal', boots: 'Boots',
  none: 'None', round: 'Round', square: 'Square', cap: 'Cap', headphones: 'Headphones', beanie: 'Beanie', stubble: 'Stubble', full: 'Full beard',
};

function Options<T extends string>({ value, options, onChange }: { value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o} className={`chip ${value === o ? 'chip-on' : ''}`} onClick={() => onChange(o)}>
          {LABELS[o] ?? o}
        </button>
      ))}
    </div>
  );
}

function Swatches({ value, colors, onChange }: { value: string; colors: string[]; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {colors.map((c) => (
        <button
          key={c}
          title={c}
          onClick={() => onChange(c)}
          className={`h-7 w-7 rounded-full border-2 transition hover:scale-110 ${value.toLowerCase() === c.toLowerCase() ? 'border-brand ring-2 ring-brand/40' : 'border-white/20'}`}
          style={{ background: c }}
        />
      ))}
      <label className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border-2 border-dashed border-white/40" title="Custom color">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        <span className="flex h-full w-full items-center justify-center text-xs text-white/70">+</span>
      </label>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="label">{label}</div>
      {children}
    </div>
  );
}

const TABS = ['Body', 'Face', 'Hair', 'Outfit', 'Extras'] as const;

export function AvatarCreator({ mode }: { mode: 'welcome' | 'edit' }) {
  const app = useApp();
  const existing = app.user?.avatar ?? null;
  const [step, setStep] = useState<1 | 2 | 3>(mode === 'edit' ? 2 : existing ? 3 : 1);
  const [name, setName] = useState(app.user?.displayName ?? '');
  const [cfg, setCfg] = useState<AvatarConfig>(existing ?? AVATAR_PRESETS[0].config);
  const [tab, setTab] = useState<(typeof TABS)[number]>('Body');
  const [anim, setAnim] = useState<PreviewAnim>('idle');
  const [autoRotate, setAutoRotate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cleanName = sanitizeName(name);
  const nameOk = cleanName.length >= 2;
  const set = <K extends keyof AvatarConfig>(k: K, v: AvatarConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const presetGroups = useMemo(() => ['Nam', 'Nữ', 'Trung tính'] as const, []);

  async function persist() {
    const avatar = sanitizeAvatar(cfg);
    const st = useApp.getState();
    if (!st.token) {
      const { token, user } = await api.guest(cleanName, avatar);
      localStorage.setItem('xbrain.token', token);
      useApp.getState().set({ token, user });
    } else {
      if (cleanName !== st.user?.displayName) await api.updateMe(cleanName);
      const { user } = await api.saveAvatar(avatar);
      useApp.getState().set({ user });
    }
  }

  async function enter() {
    if (!nameOk) {
      setStep(1);
      setError('Please enter a display name (2–24 characters).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      audioCtx(); // unlock audio with this user gesture (voice + effects)
      await persist();
      useApp.getState().set({ phase: 'joining' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!nameOk) {
      setError('Please enter a display name (2–24 characters).');
      return;
    }
    setBusy(true);
    try {
      await persist();
      net.avatarUpdated();
      useGame.getState().toast('success', 'Avatar saved and synced to everyone.');
      useApp.getState().set({ editingInGame: false });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`fixed inset-0 z-40 flex items-center justify-center ${mode === 'edit' ? 'bg-black/70 backdrop-blur-sm' : 'bg-[#0f1115]'} p-4 text-white`}
    >
      {mode === 'welcome' && (
        <>
          <div className="pointer-events-none absolute -left-40 top-0 h-[600px] w-[600px] rounded-full bg-brand/15 blur-[140px]" />
          <div className="pointer-events-none absolute -bottom-40 right-0 h-[500px] w-[500px] rounded-full bg-brand-deep/15 blur-[140px]" />
        </>
      )}
      <div className="relative flex h-[min(760px,94vh)] w-[min(1180px,96vw)] overflow-hidden rounded-3xl border border-white/10 bg-[#121419]/95 shadow-2xl">
        {/* 3D preview */}
        <div className="relative hidden w-[46%] md:block">
          <AvatarPreview cfg={cfg} anim={anim} autoRotate={autoRotate} />
          <div className="absolute left-5 top-5 flex items-center gap-3">
            <div className="rounded-xl bg-white px-3 py-2">
              <Logo className="h-6" />
            </div>
          </div>
          <div className="absolute bottom-4 left-1/2 flex w-[92%] -translate-x-1/2 flex-wrap justify-center gap-1.5 rounded-2xl bg-black/50 p-1.5 backdrop-blur">
            {(['idle', 'walk', 'sit', 'smile', 'laugh', 'cry', 'angry', 'surprised', 'wave', 'dance'] as PreviewAnim[]).map((a) => (
              <button key={a} className={`chip ${anim === a ? 'chip-on' : ''}`} onClick={() => setAnim(a)}>
                {a[0].toUpperCase() + a.slice(1)}
              </button>
            ))}
            <button className={`chip ${autoRotate ? 'chip-on' : ''}`} onClick={() => setAutoRotate((v) => !v)} title="Auto rotate (drag to rotate, scroll to zoom)">
              <RotateCw className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="absolute right-4 top-5 text-right text-xs text-white/50">Drag to rotate 360° · Scroll to zoom</div>
        </div>

        {/* Panel */}
        <div className="flex flex-1 flex-col">
          <div className="border-b border-white/10 px-7 pb-4 pt-6">
            {mode === 'welcome' ? (
              <>
                <div className="text-xs font-semibold tracking-[0.25em] text-brand">CONNECT • WORK • COLLABORATE</div>
                <h1 className="mt-1 text-2xl font-extrabold tracking-wide">WELCOME TO XBRAIN VIRTUAL OFFICE</h1>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-extrabold">Avatar customization</h1>
                <button className="btn-ghost" onClick={() => useApp.getState().set({ editingInGame: false })}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="mt-4 flex gap-2">
              {(['Your info', 'Customize', 'Enter office'] as const).map((l, i) =>
                mode === 'edit' && i === 2 ? null : (
                  <button key={l} onClick={() => setStep((i + 1) as 1 | 2 | 3)} className={`flex-1 rounded-xl border px-3 py-2 text-left text-xs transition ${step === i + 1 ? 'border-brand bg-brand/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>
                    <div className="font-mono text-[10px] text-white/50">STEP {i + 1}</div>
                    <div className="font-semibold">{l}</div>
                  </button>
                ),
              )}
            </div>
          </div>

          <div className="scrollbar-thin flex-1 overflow-y-auto px-7 py-5">
            {step === 1 && (
              <div className="space-y-6">
                <Field label="Display name">
                  <input className="input text-base" value={name} maxLength={NAME_MAX_LENGTH} placeholder="e.g. Nguyen Van A" onChange={(e) => setName(e.target.value)} autoFocus />
                  <div className="text-xs text-white/40">Shown above your avatar. You get a unique ID, so duplicate names are fine.</div>
                </Field>
                {presetGroups.map((g) => (
                  <Field key={g} label={`Presets · ${g}`}>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {AVATAR_PRESETS.filter((p) => p.group === g).map((p) => (
                        <button key={p.id} onClick={() => setCfg(p.config)} className={`rounded-xl border p-2 text-left transition hover:bg-white/10 ${JSON.stringify(cfg) === JSON.stringify(p.config) ? 'border-brand bg-brand/10' : 'border-white/10 bg-white/5'}`}>
                          <div className="mb-1.5 flex gap-1">
                            {[p.config.skin, p.config.hairColor, p.config.topColor, p.config.bottomColor].map((c, i) => (
                              <span key={i} className="h-3.5 w-3.5 rounded-full border border-white/20" style={{ background: c }} />
                            ))}
                          </div>
                          <div className="text-xs font-semibold">{p.label}</div>
                        </button>
                      ))}
                    </div>
                  </Field>
                ))}
                <button className="btn-ghost" onClick={() => setCfg(randomAvatar())}>
                  <Dices className="h-4 w-4" /> Randomize
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                {mode === 'edit' && (
                  <Field label="Display name">
                    <input className="input" value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} />
                  </Field>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {TABS.map((t) => (
                    <button key={t} className={`chip ${tab === t ? 'chip-on' : ''}`} onClick={() => setTab(t)}>
                      {t}
                    </button>
                  ))}
                </div>
                {tab === 'Body' && (
                  <>
                    <Field label="Body type">
                      <Options value={cfg.body} options={BODY_TYPES} onChange={(v) => set('body', v)} />
                    </Field>
                    <Field label={`Height · ${Math.round(cfg.height * 172)} cm`}>
                      <input type="range" min={0.9} max={1.1} step={0.01} value={cfg.height} onChange={(e) => set('height', Number(e.target.value))} className="w-full" />
                    </Field>
                    <Field label="Skin tone">
                      <Swatches value={cfg.skin} colors={SKIN_TONES} onChange={(v) => set('skin', v)} />
                    </Field>
                  </>
                )}
                {tab === 'Face' && (
                  <>
                    <Field label="Face">
                      <Options value={cfg.face} options={FACE_TYPES} onChange={(v) => set('face', v)} />
                    </Field>
                    <Field label="Beard">
                      <Options value={cfg.beard} options={BEARDS} onChange={(v) => set('beard', v)} />
                    </Field>
                    <Field label="Glasses">
                      <Options value={cfg.glasses} options={GLASSES} onChange={(v) => set('glasses', v)} />
                    </Field>
                  </>
                )}
                {tab === 'Hair' && (
                  <>
                    <Field label="Hairstyle">
                      <Options value={cfg.hair} options={HAIR_STYLES} onChange={(v) => set('hair', v)} />
                    </Field>
                    <Field label="Hair color">
                      <Swatches value={cfg.hairColor} colors={HAIR_COLORS} onChange={(v) => set('hairColor', v)} />
                    </Field>
                  </>
                )}
                {tab === 'Outfit' && (
                  <>
                    <Field label="Top">
                      <Options value={cfg.top} options={TOP_STYLES} onChange={(v) => set('top', v)} />
                    </Field>
                    <Field label="Top color">
                      <Swatches value={cfg.topColor} colors={CLOTH_COLORS} onChange={(v) => set('topColor', v)} />
                    </Field>
                    <Field label="Bottom">
                      <Options value={cfg.bottom} options={BOTTOM_STYLES} onChange={(v) => set('bottom', v)} />
                    </Field>
                    <Field label="Bottom color">
                      <Swatches value={cfg.bottomColor} colors={CLOTH_COLORS} onChange={(v) => set('bottomColor', v)} />
                    </Field>
                    <Field label="Shoes">
                      <Options value={cfg.shoes} options={SHOE_STYLES} onChange={(v) => set('shoes', v)} />
                    </Field>
                    <Field label="Shoe color">
                      <Swatches value={cfg.shoesColor} colors={['#111111', '#ffffff', '#3a2a20', '#4b5058', '#b23a2e', '#f7941d', '#2d5f8b']} onChange={(v) => set('shoesColor', v)} />
                    </Field>
                  </>
                )}
                {tab === 'Extras' && (
                  <>
                    <Field label="Headwear">
                      <Options value={cfg.headwear} options={HEADWEAR} onChange={(v) => set('headwear', v)} />
                    </Field>
                    {cfg.headwear !== 'none' && (
                      <Field label="Headwear color">
                        <Swatches value={cfg.headwearColor} colors={CLOTH_COLORS} onChange={(v) => set('headwearColor', v)} />
                      </Field>
                    )}
                    <Field label="Accessories">
                      <div className="flex flex-wrap gap-1.5">
                        <button className={`chip ${cfg.badge ? 'chip-on' : ''}`} onClick={() => set('badge', !cfg.badge)}>
                          XBrain staff badge
                        </button>
                        <button className={`chip ${cfg.earrings ? 'chip-on' : ''}`} onClick={() => set('earrings', !cfg.earrings)}>
                          Earrings
                        </button>
                      </div>
                    </Field>
                  </>
                )}
                <div className="flex gap-2 pt-2">
                  <button className="btn-ghost" onClick={() => setCfg(randomAvatar())}>
                    <Dices className="h-4 w-4" /> Randomize
                  </button>
                  <button className="btn-ghost" onClick={() => setCfg(existing ?? DEFAULT_AVATAR)}>
                    Reset
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="flex h-full flex-col justify-center gap-6">
                <div>
                  <div className="label">Ready</div>
                  <div className="mt-1 text-3xl font-extrabold">{app.user && cleanName === app.user.displayName ? `Welcome back, ${cleanName}!` : cleanName || 'Your avatar'}</div>
                  <p className="mt-2 max-w-md text-sm text-white/60">
                    You will appear at the entrance of <b className="text-white">{app.serverConfig?.name ?? 'XBrain Office'}</b>. Walk in with <span className="kbd">W</span> <span className="kbd">A</span> <span className="kbd">S</span>{' '}
                    <span className="kbd">D</span>, sit at a free desk with <span className="kbd">E</span> to start your work timer, and talk to people nearby with your microphone.
                  </p>
                </div>
                <div className="grid max-w-md grid-cols-3 gap-2 text-center text-xs">
                  <div className="glass-light p-3">
                    <div className="text-lg font-bold">50</div>desks
                  </div>
                  <div className="glass-light p-3">
                    <div className="text-lg font-bold">{app.serverConfig?.capacity ?? 50}</div>max online
                  </div>
                  <div className="glass-light p-3">
                    <div className="text-lg font-bold">{app.serverConfig?.voice.enabled ? 'ON' : 'OFF'}</div>proximity voice
                  </div>
                </div>
                <button className="btn-primary h-14 max-w-md text-base tracking-widest" disabled={busy} onClick={enter}>
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />} ENTER XBRAIN OFFICE
                </button>
              </div>
            )}
            {error && <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}
          </div>

          <div className="flex items-center justify-between border-t border-white/10 px-7 py-4">
            {mode === 'edit' ? (
              <>
                <button className="btn-ghost" onClick={() => useApp.getState().set({ editingInGame: false })}>
                  Cancel
                </button>
                <button className="btn-primary" disabled={busy} onClick={saveEdit}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes
                </button>
              </>
            ) : (
              <>
                <button className="btn-ghost" disabled={step === 1} onClick={() => setStep((s) => Math.max(1, s - 1) as 1 | 2 | 3)}>
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                {step < 3 ? (
                  <button className="btn-primary" disabled={step === 1 && !nameOk} onClick={() => setStep((s) => Math.min(3, s + 1) as 1 | 2 | 3)}>
                    Next <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <span className="text-xs text-white/40">Your look is saved to your profile.</span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
