/**
 * Keyframed / procedural animation clips for the avatar skeleton, split into two
 * layers (lower body + upper body) so emotes and typing can play while sitting
 * or walking. Clips are generated once and shared by every avatar.
 */
import * as THREE from 'three';
import type { EmoteName } from '@xbrain/shared';
import type { BoneName } from './avatarFactory';

type E = [number, number, number];
type Pose = Partial<Record<BoneName, E>> & { hipsY?: number; hipsZ?: number };

const LOWER: BoneName[] = ['hips', 'upperLegL', 'lowerLegL', 'footL', 'upperLegR', 'lowerLegR', 'footR'];
const UPPER: BoneName[] = ['spine', 'chest', 'neck', 'head', 'upperArmL', 'foreArmL', 'handL', 'upperArmR', 'foreArmR', 'handR'];

export type LowerClip = 'idle' | 'walk' | 'run' | 'jump' | 'sit' | 'dance';
export type UpperClip = 'idle' | 'walk' | 'run' | 'jump' | 'sit' | 'type' | 'talk' | EmoteName;

interface Key {
  t: number;
  p: Pose;
}

const q = new THREE.Quaternion();
const eu = new THREE.Euler();

function buildClip(name: string, duration: number, keys: Key[], bones: BoneName[], includeHips: boolean): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  const times = keys.map((k) => k.t);
  for (const b of bones) {
    if (!keys.some((k) => k.p[b])) continue;
    let last: E = keys.find((k) => k.p[b])!.p[b]!;
    const values: number[] = [];
    for (const k of keys) {
      const e = k.p[b] ?? last;
      last = e;
      eu.set(e[0], e[1], e[2]);
      q.setFromEuler(eu);
      values.push(q.x, q.y, q.z, q.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${b}.quaternion`, times, values));
  }
  if (includeHips && keys.some((k) => k.p.hipsY !== undefined || k.p.hipsZ !== undefined)) {
    const values: number[] = [];
    let ly = 0.95;
    let lz = 0;
    for (const k of keys) {
      ly = k.p.hipsY ?? ly;
      lz = k.p.hipsZ ?? lz;
      values.push(0, ly, lz);
    }
    tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, values));
  }
  return new THREE.AnimationClip(name, duration, tracks);
}

/** Sample a periodic function into keys. */
function cyclic(duration: number, samples: number, fn: (ph: number) => Pose): Key[] {
  const keys: Key[] = [];
  for (let i = 0; i <= samples; i++) {
    const ph = i / samples;
    keys.push({ t: ph * duration, p: fn(ph % 1) });
  }
  return keys;
}

const TAU = Math.PI * 2;
const pos = (v: number) => Math.max(0, v);

function locomotion(amp: { thigh: number; knee: number; arm: number; fore: number; lean: number; bob: number; base: number; twist: number }) {
  return (ph: number): Pose => {
    const c = Math.cos(TAU * ph);
    const s = Math.sin(TAU * ph);
    const kneeL = 0.06 + amp.knee * pos(Math.sin(TAU * (ph - 0.5)));
    const kneeR = 0.06 + amp.knee * pos(Math.sin(TAU * ph));
    const thighL = -amp.thigh * c;
    const thighR = amp.thigh * c;
    return {
      hipsY: amp.base + amp.bob * Math.abs(s),
      hips: [0, amp.twist * c, 0],
      upperLegL: [thighL, 0, 0.02],
      lowerLegL: [kneeL, 0, 0],
      footL: [-0.25 * pos(-c) + 0.1 * pos(c) - kneeL * 0.25, 0, 0],
      upperLegR: [thighR, 0, -0.02],
      lowerLegR: [kneeR, 0, 0],
      footR: [-0.25 * pos(c) + 0.1 * pos(-c) - kneeR * 0.25, 0, 0],
      spine: [amp.lean, -amp.twist * 0.8 * c, 0],
      chest: [amp.lean * 0.4, -amp.twist * 0.4 * c, 0],
      head: [-amp.lean * 0.6, amp.twist * 0.5 * c, 0],
      upperArmL: [amp.arm * c, 0, 0.1],
      upperArmR: [-amp.arm * c, 0, -0.1],
      foreArmL: [-amp.fore - 0.15 * pos(-c), 0, 0],
      foreArmR: [-amp.fore - 0.15 * pos(c), 0, 0],
    };
  };
}

const SIT_LOWER: Pose = {
  hipsY: 0.53,
  hipsZ: -0.02,
  hips: [0, 0, 0],
  upperLegL: [-1.52, 0, 0.07],
  lowerLegL: [1.45, 0, 0],
  footL: [0.05, 0, 0],
  upperLegR: [-1.52, 0, -0.07],
  lowerLegR: [1.45, 0, 0],
  footR: [0.05, 0, 0],
};

interface ClipSet {
  lower: Record<LowerClip, THREE.AnimationClip>;
  upper: Record<UpperClip, THREE.AnimationClip>;
  loops: Record<string, boolean>;
}

let cache: ClipSet | null = null;

export function getClips(): ClipSet {
  if (cache) return cache;
  const defs: Record<string, { dur: number; keys: Key[]; loop: boolean }> = {};

  defs.idle = {
    dur: 3.2,
    loop: true,
    keys: [
      { t: 0, p: { hipsY: 0.95, hips: [0, 0, 0], upperLegL: [0, 0, 0.025], upperLegR: [0, 0, -0.025], lowerLegL: [0.02, 0, 0], lowerLegR: [0.02, 0, 0], footL: [0, 0, 0], footR: [0, 0, 0], spine: [0.02, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0], upperArmL: [0.05, 0, 0.1], upperArmR: [0.05, 0, -0.1], foreArmL: [-0.15, 0, 0], foreArmR: [-0.15, 0, 0], handL: [0, 0, 0], handR: [0, 0, 0] } },
      { t: 1.6, p: { hipsY: 0.947, spine: [0.035, 0, 0], chest: [0.03, 0, 0], head: [-0.03, 0.08, 0], upperArmL: [0.03, 0, 0.12], upperArmR: [0.03, 0, -0.12], foreArmL: [-0.18, 0, 0], foreArmR: [-0.18, 0, 0] } },
      { t: 3.2, p: { hipsY: 0.95, spine: [0.02, 0, 0], chest: [0, 0, 0], head: [0, 0, 0], upperArmL: [0.05, 0, 0.1], upperArmR: [0.05, 0, -0.1], foreArmL: [-0.15, 0, 0], foreArmR: [-0.15, 0, 0] } },
    ],
  };
  defs.walk = { dur: 1.0, loop: true, keys: cyclic(1.0, 12, locomotion({ thigh: 0.42, knee: 0.75, arm: 0.36, fore: 0.25, lean: 0.04, bob: 0.025, base: 0.945, twist: 0.08 })) };
  defs.run = { dur: 0.64, loop: true, keys: cyclic(0.64, 12, locomotion({ thigh: 0.78, knee: 1.35, arm: 0.75, fore: 1.25, lean: 0.2, bob: 0.06, base: 0.92, twist: 0.12 })) };
  defs.jump = {
    dur: 0.5,
    loop: false,
    keys: [
      { t: 0, p: { hipsY: 0.93, upperLegL: [-0.4, 0, 0.05], lowerLegL: [0.8, 0, 0], upperLegR: [-0.1, 0, -0.05], lowerLegR: [0.5, 0, 0], footL: [0.2, 0, 0], footR: [0.2, 0, 0], spine: [0.1, 0, 0], upperArmL: [-0.5, 0, 0.6], upperArmR: [-0.5, 0, -0.6], foreArmL: [-0.6, 0, 0], foreArmR: [-0.6, 0, 0], head: [-0.1, 0, 0] } },
      { t: 0.5, p: { hipsY: 0.93, upperLegL: [-0.7, 0, 0.05], lowerLegL: [1.1, 0, 0], upperLegR: [-0.2, 0, -0.05], lowerLegR: [0.7, 0, 0], footL: [0.3, 0, 0], footR: [0.3, 0, 0], spine: [0.05, 0, 0], upperArmL: [-0.3, 0, 0.9], upperArmR: [-0.3, 0, -0.9], foreArmL: [-0.4, 0, 0], foreArmR: [-0.4, 0, 0], head: [-0.15, 0, 0] } },
    ],
  };
  defs.sit = {
    dur: 4,
    loop: true,
    keys: [
      { t: 0, p: { ...SIT_LOWER, spine: [-0.1, 0, 0], chest: [0.02, 0, 0], head: [0.06, 0, 0], neck: [0, 0, 0], upperArmL: [-0.42, 0, 0.14], upperArmR: [-0.42, 0, -0.14], foreArmL: [-0.95, 0, -0.15], foreArmR: [-0.95, 0, 0.15], handL: [0, 0, 0], handR: [0, 0, 0] } },
      { t: 2, p: { ...SIT_LOWER, spine: [-0.085, 0, 0], chest: [0.035, 0, 0], head: [0.03, 0.12, 0] } },
      { t: 4, p: { ...SIT_LOWER, spine: [-0.1, 0, 0], chest: [0.02, 0, 0], head: [0.06, 0, 0] } },
    ],
  };
  // Typing at the keyboard (upper only).
  const typeBase: Pose = { spine: [0.06, 0, 0], chest: [0.07, 0, 0], neck: [0.05, 0, 0], head: [0.08, 0, 0], upperArmL: [-0.72, -0.1, 0.22], upperArmR: [-0.72, 0.1, -0.22], foreArmL: [-0.95, 0.25, -0.25], foreArmR: [-0.95, -0.25, 0.25] };
  defs.type = {
    dur: 0.6,
    loop: true,
    keys: [
      { t: 0, p: { ...typeBase, handL: [0.15, 0, 0], handR: [-0.1, 0, 0] } },
      { t: 0.15, p: { handL: [-0.1, 0, 0], handR: [0.18, 0, 0] } },
      { t: 0.3, p: { handL: [0.12, 0, 0.05], handR: [-0.08, 0, 0] } },
      { t: 0.45, p: { handL: [-0.05, 0, 0], handR: [0.14, 0, -0.05], head: [0.1, 0.04, 0] } },
      { t: 0.6, p: { ...typeBase, handL: [0.15, 0, 0], handR: [-0.1, 0, 0] } },
    ],
  };
  defs.talk = {
    dur: 2.4,
    loop: true,
    keys: [
      { t: 0, p: { spine: [0.02, 0, 0], head: [0, 0, 0], upperArmL: [0.05, 0, 0.1], foreArmL: [-0.2, 0, 0], upperArmR: [-0.3, 0, -0.18], foreArmR: [-1.1, 0.3, 0], handR: [0, 0, 0] } },
      { t: 0.6, p: { head: [0.06, 0.1, 0.03], upperArmR: [-0.45, 0, -0.25], foreArmR: [-1.3, 0.5, 0], handR: [0.3, 0, 0] } },
      { t: 1.2, p: { head: [-0.03, -0.08, 0], upperArmL: [-0.3, 0, 0.2], foreArmL: [-1.0, -0.3, 0], upperArmR: [-0.2, 0, -0.15], foreArmR: [-0.9, 0.2, 0] } },
      { t: 1.8, p: { head: [0.05, 0.05, -0.03], upperArmL: [0.05, 0, 0.1], foreArmL: [-0.2, 0, 0], upperArmR: [-0.4, 0, -0.2], foreArmR: [-1.2, 0.4, 0] } },
      { t: 2.4, p: { spine: [0.02, 0, 0], head: [0, 0, 0], upperArmL: [0.05, 0, 0.1], foreArmL: [-0.2, 0, 0], upperArmR: [-0.3, 0, -0.18], foreArmR: [-1.1, 0.3, 0], handR: [0, 0, 0] } },
    ],
  };
  defs.wave = {
    dur: 1.2,
    loop: true,
    keys: cyclic(1.2, 6, (ph) => ({ spine: [0, 0, 0.05], head: [0, -0.1, 0.08], upperArmL: [0.05, 0, 0.1], foreArmL: [-0.15, 0, 0], upperArmR: [-0.25, 0, -2.45], foreArmR: [0, 0, -0.35 + 0.55 * Math.sin(TAU * ph)], handR: [0, 0, 0.2 * Math.sin(TAU * ph)] })),
  };
  defs.clap = {
    dur: 0.5,
    loop: true,
    keys: cyclic(0.5, 4, (ph) => {
      const o = 0.12 * Math.cos(TAU * ph);
      return { spine: [0.04, 0, 0], head: [0.05, 0, 0], upperArmL: [-1.0, 0, -0.1 + o], upperArmR: [-1.0, 0, 0.1 - o], foreArmL: [-0.7, 0, -0.75 + o], foreArmR: [-0.7, 0, 0.75 - o] };
    }),
  };
  defs.thumbsup = {
    dur: 1.8,
    loop: true,
    keys: [
      { t: 0, p: { spine: [0, 0, 0], head: [0, 0, 0.06], upperArmL: [0.05, 0, 0.1], foreArmL: [-0.15, 0, 0], upperArmR: [-1.0, 0, -0.25], foreArmR: [-1.0, 0, 0.2], handR: [0, 0, -0.3] } },
      { t: 0.9, p: { head: [0.05, 0, 0.1], upperArmR: [-1.1, 0, -0.3], foreArmR: [-1.05, 0, 0.25] } },
      { t: 1.8, p: { spine: [0, 0, 0], head: [0, 0, 0.06], upperArmR: [-1.0, 0, -0.25], foreArmR: [-1.0, 0, 0.2] } },
    ],
  };
  defs.cheer = {
    dur: 0.8,
    loop: true,
    keys: cyclic(0.8, 4, (ph) => {
      const b = 0.15 * Math.sin(TAU * ph);
      return { spine: [-0.08, 0, 0], chest: [-0.05, 0, 0], head: [-0.2, 0, 0], upperArmL: [0, 0, 2.6 + b], upperArmR: [0, 0, -2.6 - b], foreArmL: [0, 0, 0.3 + b], foreArmR: [0, 0, -0.3 - b] };
    }),
  };
  defs.think = {
    dur: 3,
    loop: true,
    keys: [
      { t: 0, p: { spine: [0.02, 0, 0], head: [0.12, 0.05, 0.14], upperArmR: [-0.75, 0, 0.32], foreArmR: [-2.2, 0, 0.1], handR: [0.3, 0, 0], upperArmL: [-0.45, 0, -0.2], foreArmL: [-1.45, 0, -0.5] } },
      { t: 1.5, p: { head: [0.1, -0.08, 0.16] } },
      { t: 3, p: { spine: [0.02, 0, 0], head: [0.12, 0.05, 0.14], upperArmR: [-0.75, 0, 0.32], foreArmR: [-2.2, 0, 0.1], upperArmL: [-0.45, 0, -0.2], foreArmL: [-1.45, 0, -0.5] } },
    ],
  };
  defs.bow = {
    dur: 2,
    loop: false,
    keys: [
      { t: 0, p: { spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0], upperArmL: [0.05, 0, 0.08], upperArmR: [0.05, 0, -0.08], foreArmL: [-0.1, 0, 0], foreArmR: [-0.1, 0, 0] } },
      { t: 0.6, p: { spine: [0.55, 0, 0], chest: [0.25, 0, 0], head: [0.25, 0, 0], upperArmL: [-0.2, 0, 0.02], upperArmR: [-0.2, 0, -0.02] } },
      { t: 1.3, p: { spine: [0.55, 0, 0], chest: [0.25, 0, 0], head: [0.25, 0, 0] } },
      { t: 2, p: { spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0], upperArmL: [0.05, 0, 0.08], upperArmR: [0.05, 0, -0.08] } },
    ],
  };
  defs.dance = {
    dur: 1.0,
    loop: true,
    keys: cyclic(1.0, 8, (ph) => {
      const s = Math.sin(TAU * ph);
      const c = Math.cos(TAU * ph);
      const b = Math.abs(Math.sin(TAU * ph * 2));
      return {
        hipsY: 0.9 + 0.04 * b,
        hips: [0, 0.25 * s, 0.1 * c],
        upperLegL: [-0.35 * pos(s) - 0.1, 0, 0.1],
        lowerLegL: [0.6 * pos(s) + 0.15, 0, 0],
        upperLegR: [-0.35 * pos(-s) - 0.1, 0, -0.1],
        lowerLegR: [0.6 * pos(-s) + 0.15, 0, 0],
        spine: [0.05, -0.2 * s, -0.08 * c],
        chest: [0, -0.1 * s, 0],
        head: [-0.05, 0.2 * s, 0.1 * c],
        upperArmL: [-0.3, 0, 0.8 + 0.6 * pos(s)],
        upperArmR: [-0.3, 0, -0.8 - 0.6 * pos(-s)],
        foreArmL: [-1.2, 0, 0.4],
        foreArmR: [-1.2, 0, -0.4],
      };
    }),
  };

  const lower = {} as Record<LowerClip, THREE.AnimationClip>;
  const upper = {} as Record<UpperClip, THREE.AnimationClip>;
  const loops: Record<string, boolean> = {};
  for (const [name, d] of Object.entries(defs)) {
    loops[name] = d.loop;
    if (['idle', 'walk', 'run', 'jump', 'sit', 'dance'].includes(name)) {
      lower[name as LowerClip] = buildClip(`${name}_lower`, d.dur, d.keys, LOWER, true);
    }
    upper[name as UpperClip] = buildClip(`${name}_upper`, d.dur, d.keys, UPPER, false);
  }
  cache = { lower, upper, loops };
  return cache;
}
