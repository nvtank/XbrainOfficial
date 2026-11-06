/** Tiny synthesized UI/world sound effects (no audio assets needed). */
import { useSettings } from '../stores/settings';

let ctx: AudioContext | null = null;
export function audioCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function vol() {
  const s = useSettings.getState();
  return s.masterVolume * s.effectsVolume;
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.15, delay = 0) {
  const v = vol();
  if (v <= 0) return;
  const c = audioCtx();
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain * v, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise(dur: number, gain = 0.08, filterFreq = 1200) {
  const v = vol();
  if (v <= 0) return;
  const c = audioCtx();
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.value = gain * v;
  src.connect(f).connect(g).connect(c.destination);
  src.start();
}

export const sfx = {
  chat: () => {
    tone(880, 0.12, 'sine', 0.08);
    tone(1320, 0.16, 'sine', 0.06, 0.07);
  },
  notify: () => tone(660, 0.2, 'triangle', 0.1),
  click: () => tone(1200, 0.05, 'square', 0.03),
  sit: () => tone(320, 0.18, 'sine', 0.08),
  door: () => noise(0.45, 0.06, 700),
  coffee: () => noise(1.6, 0.05, 2200),
  join: () => {
    tone(523, 0.15, 'sine', 0.07);
    tone(784, 0.2, 'sine', 0.07, 0.1);
  },
  error: () => tone(220, 0.25, 'sawtooth', 0.05),
};
