/**
 * Keyframed / procedural animation clips for the chibi skeleton, in three layers:
 *   lower body (locomotion, sit), upper body (typing, talking, emotes) and face
 * (expressions on the face bones). Layers blend independently, so an avatar can
 * walk while laughing or type while crying. Clips are generated once and shared.
 */
import * as THREE from 'three';
import type { BodyEmote, FaceExpression } from '@xbrain/shared';
import { FACE_BONES, HIP_Y, SIT_HIP_Y, faceRel, type BoneName, type FaceBone } from './avatarFactory';

type E = [number, number, number];
type Pose = Partial<Record<BoneName, E>> & { hipsY?: number; hipsZ?: number };

const LOWER: BoneName[] = ['hips', 'upperLegL', 'lowerLegL', 'footL', 'upperLegR', 'lowerLegR', 'footR'];
const UPPER: BoneName[] = ['spine', 'chest', 'neck', 'head', 'upperArmL', 'foreArmL', 'handL', 'upperArmR', 'foreArmR', 'handR'];

export type LowerClip = 'idle' | 'walk' | 'run' | 'jump' | 'sit' | 'dance';
export type UpperClip = 'idle' | 'walk' | 'run' | 'jump' | 'sit' | 'type' | 'talk' | BodyEmote;

interface Key {
  t: number;
  p: Pose;
}

const q = new THREE.Quaternion();
const eu = new THREE.Euler();
const H = HIP_Y;
const SIT_HIP = SIT_HIP_Y;

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
    let ly = H;
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
    return {
      hipsY: amp.base + amp.bob * Math.abs(s),
      hips: [0, amp.twist * c, 0.04 * s],
      upperLegL: [-amp.thigh * c, 0, 0.03],
      lowerLegL: [kneeL, 0, 0],
      footL: [-0.25 * pos(-c) + 0.1 * pos(c) - kneeL * 0.25, 0, 0],
      upperLegR: [amp.thigh * c, 0, -0.03],
      lowerLegR: [kneeR, 0, 0],
      footR: [-0.25 * pos(c) + 0.1 * pos(-c) - kneeR * 0.25, 0, 0],
      spine: [amp.lean, -amp.twist * 0.8 * c, -0.03 * s],
      chest: [amp.lean * 0.4, -amp.twist * 0.4 * c, 0],
      head: [-amp.lean * 0.6 + 0.03 * Math.abs(s), amp.twist * 0.4 * c, 0.05 * s],
      upperArmL: [amp.arm * c, 0, 0.2],
      upperArmR: [-amp.arm * c, 0, -0.2],
      foreArmL: [-amp.fore - 0.2 * pos(-c), 0, 0],
      foreArmR: [-amp.fore - 0.2 * pos(c), 0, 0],
    };
  };
}

const SIT_LOWER: Pose = {
  hipsY: SIT_HIP,
  hipsZ: -0.02,
  hips: [0, 0, 0],
  upperLegL: [-1.52, 0, 0.1],
  lowerLegL: [1.25, 0, 0],
  footL: [0.2, 0, 0],
  upperLegR: [-1.52, 0, -0.1],
  lowerLegR: [1.25, 0, 0],
  footR: [0.2, 0, 0],
};

// ───────────────────────────── face layer ─────────────────────────────
type FaceKeyPose = Partial<Record<FaceBone, { s?: E; p?: E; r?: E }>>;
const HID: E = [0.001, 0.001, 0.001];
const ONE: E = [1, 1, 1];
const FACE_BASE: Record<FaceBone, E> = {
  eyeL: ONE, eyeR: ONE, eyeShineL: ONE, eyeShineR: ONE, eyesHappy: HID, browL: ONE, browR: ONE,
  mouthSmile: [0.7, 0.62, 1], mouthFrown: HID, mouthOpen: HID, tears: HID, blush: HID,
};

function buildFaceClip(name: string, duration: number, keys: Array<{ t: number; f: FaceKeyPose }>): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  const times = keys.map((k) => k.t);
  for (const b of FACE_BONES) {
    const rel = faceRel(b);
    const sv: number[] = [];
    const pv: number[] = [];
    const rv: number[] = [];
    let last = { s: FACE_BASE[b], p: [0, 0, 0] as E, r: [0, 0, 0] as E };
    for (const k of keys) {
      const v = k.f[b];
      const cur = { s: v?.s ?? last.s, p: v?.p ?? last.p, r: v?.r ?? last.r };
      last = cur;
      sv.push(...cur.s);
      pv.push(rel[0] + cur.p[0], rel[1] + cur.p[1], rel[2] + cur.p[2]);
      eu.set(cur.r[0], cur.r[1], cur.r[2]);
      q.setFromEuler(eu);
      rv.push(q.x, q.y, q.z, q.w);
    }
    tracks.push(new THREE.VectorKeyframeTrack(`${b}.scale`, times, sv));
    tracks.push(new THREE.VectorKeyframeTrack(`${b}.position`, times, pv));
    tracks.push(new THREE.QuaternionKeyframeTrack(`${b}.quaternion`, times, rv));
  }
  return new THREE.AnimationClip(name, duration, tracks);
}

const eyes = (sx: number, sy: number): FaceKeyPose => ({ eyeL: { s: [sx, sy, 1] }, eyeR: { s: [sx, sy, 1] }, eyeShineL: { s: [1, Math.min(1, sy), 1] }, eyeShineR: { s: [1, Math.min(1, sy), 1] } });
const blinkKeys = (dur: number, base: FaceKeyPose, eyeOpen = 1): Array<{ t: number; f: FaceKeyPose }> => [
  { t: 0, f: { ...base, ...eyes(1, eyeOpen) } },
  { t: dur - 0.32, f: eyes(1, eyeOpen) },
  { t: dur - 0.22, f: eyes(1.05, 0.08) },
  { t: dur - 0.12, f: eyes(1, eyeOpen) },
  { t: dur, f: eyes(1, eyeOpen) },
];
const brows = (rot: number, dy = 0): FaceKeyPose => ({ browL: { r: [0, 0, rot], p: [0, dy, 0] }, browR: { r: [0, 0, -rot], p: [0, dy, 0] } });

function faceClips(): Record<FaceExpression, THREE.AnimationClip> {
  const neutral: FaceKeyPose = { ...brows(0), mouthSmile: { s: [0.7, 0.62, 1] }, mouthFrown: { s: HID }, mouthOpen: { s: HID }, eyesHappy: { s: HID }, tears: { s: HID }, blush: { s: HID } };
  const out = {} as Record<FaceExpression, THREE.AnimationClip>;
  out.neutral = buildFaceClip('face_neutral', 3.6, blinkKeys(3.6, neutral));
  out.smile = buildFaceClip('face_smile', 3.0, blinkKeys(3.0, { ...neutral, mouthSmile: { s: [1.25, 1.2, 1] }, blush: { s: [0.7, 0.7, 0.7] }, ...brows(-0.08, 0.006) }));
  out.happy = buildFaceClip('face_happy', 1.0, [
    { t: 0, f: { ...neutral, eyeL: { s: HID }, eyeR: { s: HID }, eyeShineL: { s: HID }, eyeShineR: { s: HID }, eyesHappy: { s: ONE }, mouthSmile: { s: [1.45, 1.5, 1] }, blush: { s: ONE }, ...brows(-0.12, 0.012) } },
    { t: 0.5, f: { mouthSmile: { s: [1.55, 1.6, 1] } } },
    { t: 1.0, f: { mouthSmile: { s: [1.45, 1.5, 1] } } },
  ]);
  out.laugh = buildFaceClip('face_laugh', 0.36, [
    { t: 0, f: { ...neutral, eyeL: { s: HID }, eyeR: { s: HID }, eyeShineL: { s: HID }, eyeShineR: { s: HID }, eyesHappy: { s: [1.1, 1.15, 1] }, mouthSmile: { s: HID }, mouthOpen: { s: [1.3, 1.0, 1] }, blush: { s: ONE }, ...brows(-0.15, 0.015) } },
    { t: 0.18, f: { mouthOpen: { s: [1.3, 1.55, 1] } } },
    { t: 0.36, f: { mouthOpen: { s: [1.3, 1.0, 1] } } },
  ]);
  const sadBase: FaceKeyPose = { ...neutral, ...eyes(1, 0.82), mouthSmile: { s: HID }, mouthFrown: { s: ONE }, ...brows(-0.4, 0.008) };
  out.sad = buildFaceClip('face_sad', 4.0, blinkKeys(4.0, sadBase, 0.82));
  out.cry = buildFaceClip('face_cry', 0.8, [
    { t: 0, f: { ...sadBase, ...eyes(1.05, 0.45), mouthFrown: { s: HID }, mouthOpen: { s: [0.8, 0.55, 1] }, tears: { s: ONE, p: [0, 0.01, 0] }, blush: { s: [0.6, 0.6, 0.6] } } },
    { t: 0.4, f: { tears: { s: [1, 1.15, 1], p: [0, -0.045, 0] }, mouthOpen: { s: [0.9, 0.8, 1] } } },
    { t: 0.8, f: { tears: { s: ONE, p: [0, 0.01, 0] }, mouthOpen: { s: [0.8, 0.55, 1] } } },
  ]);
  out.angry = buildFaceClip('face_angry', 0.5, [
    { t: 0, f: { ...neutral, ...eyes(1.05, 0.7), mouthSmile: { s: HID }, mouthFrown: { s: [1.25, 0.8, 1] }, ...brows(0.5, -0.012), blush: { s: [0.9, 0.9, 0.9] } } },
    { t: 0.25, f: { mouthFrown: { s: [1.35, 0.9, 1] }, browL: { r: [0, 0, 0.55], p: [0, -0.015, 0] }, browR: { r: [0, 0, -0.55], p: [0, -0.015, 0] } } },
    { t: 0.5, f: { mouthFrown: { s: [1.25, 0.8, 1] }, browL: { r: [0, 0, 0.5], p: [0, -0.012, 0] }, browR: { r: [0, 0, -0.5], p: [0, -0.012, 0] } } },
  ]);
  out.surprised = buildFaceClip('face_surprised', 2.0, [
    { t: 0, f: { ...neutral, ...eyes(1.2, 1.3), mouthSmile: { s: HID }, mouthOpen: { s: [0.75, 1.25, 1] }, ...brows(-0.1, 0.03) } },
    { t: 1.0, f: { mouthOpen: { s: [0.7, 1.15, 1] } } },
    { t: 2.0, f: { mouthOpen: { s: [0.75, 1.25, 1] } } },
  ]);
  out.think = buildFaceClip('face_think', 3.0, [
    { t: 0, f: { ...neutral, eyeL: { s: [1, 0.85, 1], p: [0.008, 0.01, 0] }, eyeR: { s: [1, 0.85, 1], p: [0.008, 0.01, 0] }, eyeShineL: { p: [0.008, 0.01, 0] }, eyeShineR: { p: [0.008, 0.01, 0] }, mouthSmile: { s: [0.55, 0.22, 1], p: [0.012, 0, 0] }, browL: { r: [0, 0, -0.15], p: [0, 0.02, 0] }, browR: { r: [0, 0, 0.2], p: [0, -0.004, 0] } } },
    { t: 1.5, f: { eyeL: { s: [1, 0.85, 1], p: [-0.004, 0.012, 0] }, eyeR: { s: [1, 0.85, 1], p: [-0.004, 0.012, 0] }, eyeShineL: { p: [-0.004, 0.012, 0] }, eyeShineR: { p: [-0.004, 0.012, 0] } } },
    { t: 3.0, f: { eyeL: { s: [1, 0.85, 1], p: [0.008, 0.01, 0] }, eyeR: { s: [1, 0.85, 1], p: [0.008, 0.01, 0] }, eyeShineL: { p: [0.008, 0.01, 0] }, eyeShineR: { p: [0.008, 0.01, 0] } } },
  ]);
  out.talk = buildFaceClip('face_talk', 0.6, [
    { t: 0, f: { ...neutral, mouthSmile: { s: HID }, mouthOpen: { s: [0.8, 0.35, 1] } } },
    { t: 0.12, f: { mouthOpen: { s: [0.85, 0.85, 1] } } },
    { t: 0.24, f: { mouthOpen: { s: [0.75, 0.4, 1] } } },
    { t: 0.38, f: { mouthOpen: { s: [0.9, 1.0, 1] } } },
    { t: 0.5, f: { mouthOpen: { s: [0.8, 0.3, 1] } } },
    { t: 0.6, f: { mouthOpen: { s: [0.8, 0.35, 1] } } },
  ]);
  return out;
}

interface ClipSet {
  lower: Record<LowerClip, THREE.AnimationClip>;
  upper: Record<UpperClip, THREE.AnimationClip>;
  face: Record<FaceExpression, THREE.AnimationClip>;
  loops: Record<string, boolean>;
}

let cache: ClipSet | null = null;

export function getClips(): ClipSet {
  if (cache) return cache;
  const defs: Record<string, { dur: number; keys: Key[]; loop: boolean }> = {};
  const restArms: Pose = { upperArmL: [0.05, 0, 0.2], upperArmR: [0.05, 0, -0.2], foreArmL: [-0.2, 0, 0], foreArmR: [-0.2, 0, 0] };

  defs.idle = {
    dur: 3.2,
    loop: true,
    keys: [
      { t: 0, p: { hipsY: H, hips: [0, 0, 0], upperLegL: [0, 0, 0.03], upperLegR: [0, 0, -0.03], lowerLegL: [0.02, 0, 0], lowerLegR: [0.02, 0, 0], footL: [0, 0, 0], footR: [0, 0, 0], spine: [0.02, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0.03], ...restArms, handL: [0, 0, 0], handR: [0, 0, 0] } },
      { t: 1.6, p: { hipsY: H - 0.006, spine: [0.035, 0, 0.02], chest: [0.03, 0, 0], head: [-0.04, 0.1, -0.04], upperArmL: [0.03, 0, 0.24], upperArmR: [0.03, 0, -0.24], foreArmL: [-0.24, 0, 0], foreArmR: [-0.24, 0, 0] } },
      { t: 3.2, p: { hipsY: H, spine: [0.02, 0, 0], chest: [0, 0, 0], head: [0, 0, 0.03], ...restArms } },
    ],
  };
  defs.walk = { dur: 0.8, loop: true, keys: cyclic(0.8, 12, locomotion({ thigh: 0.5, knee: 0.8, arm: 0.5, fore: 0.3, lean: 0.05, bob: 0.025, base: H - 0.005, twist: 0.1 })) };
  defs.run = { dur: 0.5, loop: true, keys: cyclic(0.5, 12, locomotion({ thigh: 0.85, knee: 1.3, arm: 0.9, fore: 1.2, lean: 0.22, bob: 0.045, base: H - 0.02, twist: 0.14 })) };
  defs.jump = {
    dur: 0.5,
    loop: false,
    keys: [
      { t: 0, p: { hipsY: H - 0.01, upperLegL: [-0.5, 0, 0.05], lowerLegL: [0.9, 0, 0], upperLegR: [-0.15, 0, -0.05], lowerLegR: [0.6, 0, 0], footL: [0.2, 0, 0], footR: [0.2, 0, 0], spine: [0.1, 0, 0], upperArmL: [-0.4, 0, 1.0], upperArmR: [-0.4, 0, -1.0], foreArmL: [-0.4, 0, 0], foreArmR: [-0.4, 0, 0], head: [-0.15, 0, 0] } },
      { t: 0.5, p: { hipsY: H - 0.01, upperLegL: [-0.8, 0, 0.05], lowerLegL: [1.2, 0, 0], upperLegR: [-0.3, 0, -0.05], lowerLegR: [0.8, 0, 0], footL: [0.3, 0, 0], footR: [0.3, 0, 0], spine: [0.05, 0, 0], upperArmL: [-0.2, 0, 1.4], upperArmR: [-0.2, 0, -1.4], foreArmL: [-0.3, 0, 0], foreArmR: [-0.3, 0, 0], head: [-0.2, 0, 0] } },
    ],
  };
  defs.sit = {
    dur: 4,
    loop: true,
    keys: [
      { t: 0, p: { ...SIT_LOWER, spine: [-0.08, 0, 0], chest: [0.02, 0, 0], head: [0.04, 0, 0], neck: [0, 0, 0], upperArmL: [-0.5, 0, 0.18], upperArmR: [-0.5, 0, -0.18], foreArmL: [-0.8, 0, -0.2], foreArmR: [-0.8, 0, 0.2], handL: [0, 0, 0], handR: [0, 0, 0] } },
      { t: 2, p: { ...SIT_LOWER, footL: [0.35, 0, 0], footR: [0.05, 0, 0], spine: [-0.065, 0, 0], chest: [0.035, 0, 0], head: [0.02, 0.15, 0.04] } },
      { t: 4, p: { ...SIT_LOWER, spine: [-0.08, 0, 0], chest: [0.02, 0, 0], head: [0.04, 0, 0] } },
    ],
  };
  const typeBase: Pose = { spine: [0.08, 0, 0], chest: [0.08, 0, 0], neck: [0.04, 0, 0], head: [0.06, 0, 0], upperArmL: [-0.95, -0.1, 0.25], upperArmR: [-0.95, 0.1, -0.25], foreArmL: [-0.75, 0.3, -0.3], foreArmR: [-0.75, -0.3, 0.3] };
  defs.type = {
    dur: 0.5,
    loop: true,
    keys: [
      { t: 0, p: { ...typeBase, handL: [0.2, 0, 0], handR: [-0.12, 0, 0] } },
      { t: 0.125, p: { handL: [-0.12, 0, 0], handR: [0.22, 0, 0] } },
      { t: 0.25, p: { handL: [0.16, 0, 0.05], handR: [-0.1, 0, 0] } },
      { t: 0.375, p: { handL: [-0.06, 0, 0], handR: [0.18, 0, -0.05], head: [0.08, 0.05, 0] } },
      { t: 0.5, p: { ...typeBase, handL: [0.2, 0, 0], handR: [-0.12, 0, 0] } },
    ],
  };
  defs.talk = {
    dur: 2.4,
    loop: true,
    keys: [
      { t: 0, p: { spine: [0.02, 0, 0], head: [0, 0, 0], upperArmL: [0.05, 0, 0.2], foreArmL: [-0.2, 0, 0], upperArmR: [-0.4, 0, -0.25], foreArmR: [-1.1, 0.3, 0], handR: [0, 0, 0] } },
      { t: 0.6, p: { head: [0.08, 0.12, 0.05], upperArmR: [-0.55, 0, -0.35], foreArmR: [-1.3, 0.5, 0], handR: [0.3, 0, 0] } },
      { t: 1.2, p: { head: [-0.04, -0.1, -0.03], upperArmL: [-0.4, 0, 0.3], foreArmL: [-1.0, -0.3, 0], upperArmR: [-0.3, 0, -0.2], foreArmR: [-0.9, 0.2, 0] } },
      { t: 1.8, p: { head: [0.06, 0.06, -0.05], upperArmL: [0.05, 0, 0.2], foreArmL: [-0.2, 0, 0], upperArmR: [-0.5, 0, -0.3], foreArmR: [-1.2, 0.4, 0] } },
      { t: 2.4, p: { spine: [0.02, 0, 0], head: [0, 0, 0], upperArmL: [0.05, 0, 0.2], foreArmL: [-0.2, 0, 0], upperArmR: [-0.4, 0, -0.25], foreArmR: [-1.1, 0.3, 0], handR: [0, 0, 0] } },
    ],
  };
  // ── body emotes (upper layer) ──
  defs.wave = {
    dur: 1.0,
    loop: true,
    keys: cyclic(1.0, 6, (ph) => ({ spine: [0, 0, 0.06], head: [0, -0.15, 0.12], upperArmL: [0.05, 0, 0.2], foreArmL: [-0.2, 0, 0], upperArmR: [-0.2, 0, -2.5], foreArmR: [0, 0, -0.3 + 0.6 * Math.sin(TAU * ph)], handR: [0, 0, 0.25 * Math.sin(TAU * ph)] })),
  };
  defs.clap = {
    dur: 0.42,
    loop: true,
    keys: cyclic(0.42, 4, (ph) => {
      const o = 0.14 * Math.cos(TAU * ph);
      return { spine: [0.04, 0, 0], head: [-0.05, 0, 0], upperArmL: [-1.1, 0, -0.05 + o], upperArmR: [-1.1, 0, 0.05 - o], foreArmL: [-0.6, 0, -0.8 + o], foreArmR: [-0.6, 0, 0.8 - o] };
    }),
  };
  defs.thumbsup = {
    dur: 1.8,
    loop: true,
    keys: [
      { t: 0, p: { spine: [0, 0, 0], head: [0, 0, 0.12], ...restArms, upperArmR: [-1.1, 0, -0.3], foreArmR: [-1.0, 0, 0.3], handR: [0, 0, -0.3] } },
      { t: 0.9, p: { head: [0.05, 0, 0.18], upperArmR: [-1.25, 0, -0.35], foreArmR: [-1.05, 0, 0.35] } },
      { t: 1.8, p: { spine: [0, 0, 0], head: [0, 0, 0.12], upperArmR: [-1.1, 0, -0.3], foreArmR: [-1.0, 0, 0.3] } },
    ],
  };
  defs.cheer = {
    dur: 0.7,
    loop: true,
    keys: cyclic(0.7, 4, (ph) => {
      const b = 0.18 * Math.sin(TAU * ph);
      return { spine: [-0.1, 0, 0], chest: [-0.05, 0, 0], head: [-0.25, 0, 0], upperArmL: [0, 0, 2.6 + b], upperArmR: [0, 0, -2.6 - b], foreArmL: [0, 0, 0.3 + b], foreArmR: [0, 0, -0.3 - b] };
    }),
  };
  defs.happy = {
    dur: 0.8,
    loop: true,
    keys: cyclic(0.8, 6, (ph) => {
      const s = Math.sin(TAU * ph);
      return { spine: [-0.05, 0, 0.1 * s], chest: [0, 0.1 * s, 0], head: [-0.1, 0, -0.15 * s], upperArmL: [-0.3, 0, 1.1 + 0.25 * s], upperArmR: [-0.3, 0, -1.1 + 0.25 * s], foreArmL: [-0.5, 0, 0.4], foreArmR: [-0.5, 0, -0.4] };
    }),
  };
  defs.laugh = {
    dur: 0.36,
    loop: true,
    keys: cyclic(0.36, 4, (ph) => {
      const s = Math.sin(TAU * ph);
      return { spine: [-0.1 + 0.05 * s, 0, 0], chest: [-0.06 + 0.04 * s, 0, 0], head: [-0.28 + 0.07 * s, 0, 0.04], upperArmL: [-0.55, 0, -0.15], upperArmR: [-0.55, 0, 0.15], foreArmL: [-1.3, 0, -0.55], foreArmR: [-1.3, 0, 0.55] };
    }),
  };
  defs.cry = {
    dur: 0.8,
    loop: true,
    keys: cyclic(0.8, 6, (ph) => {
      const s = Math.sin(TAU * ph * 2);
      return { spine: [0.08, 0, 0], chest: [0.04 + 0.04 * s, 0, 0], head: [0.12, 0.08 * Math.sin(TAU * ph), 0], upperArmL: [-2.45, 0, -0.42], upperArmR: [-2.45, 0, 0.42], foreArmL: [-0.75, 0, -0.55 + 0.12 * s], foreArmR: [-0.75, 0, 0.55 - 0.12 * s] };
    }),
  };
  defs.sad = {
    dur: 3,
    loop: true,
    keys: [
      { t: 0, p: { spine: [0.22, 0, 0], chest: [0.1, 0, 0], head: [0.38, 0, 0.05], upperArmL: [0.15, 0, 0.08], upperArmR: [0.15, 0, -0.08], foreArmL: [-0.1, 0, 0], foreArmR: [-0.1, 0, 0] } },
      { t: 1.5, p: { head: [0.42, -0.08, 0.08], chest: [0.12, 0, 0] } },
      { t: 3, p: { spine: [0.22, 0, 0], chest: [0.1, 0, 0], head: [0.38, 0, 0.05] } },
    ],
  };
  defs.angry = {
    dur: 0.5,
    loop: true,
    keys: cyclic(0.5, 4, (ph) => {
      const s = Math.sin(TAU * ph);
      return { spine: [0.12, 0, 0], chest: [0.06, 0, 0], head: [0.15, 0.06 * s, 0], upperArmL: [-0.35, 0, 0.35 + 0.08 * s], upperArmR: [-0.35, 0, -0.35 - 0.08 * s], foreArmL: [-1.7, 0, 0], foreArmR: [-1.7, 0, 0], handL: [0.2 * s, 0, 0], handR: [-0.2 * s, 0, 0] };
    }),
  };
  defs.surprised = {
    dur: 1.0,
    loop: true,
    keys: cyclic(1.0, 4, (ph) => {
      const s = Math.sin(TAU * ph);
      return { spine: [-0.15, 0, 0], chest: [-0.05, 0, 0], head: [-0.12 + 0.02 * s, 0, 0], upperArmL: [-2.3, 0, -0.15], upperArmR: [-2.3, 0, 0.15], foreArmL: [-0.6, 0, -0.75 + 0.06 * s], foreArmR: [-0.6, 0, 0.75 - 0.06 * s] };
    }),
  };
  defs.think = {
    dur: 3,
    loop: true,
    keys: [
      { t: 0, p: { spine: [0.02, 0, 0], head: [0.12, 0.08, 0.18], upperArmR: [-2.0, 0, 0.35], foreArmR: [-1.1, 0, 0.5], handR: [0.3, 0, 0], upperArmL: [-0.9, 0, -0.25], foreArmL: [-1.35, 0, -0.75] } },
      { t: 1.5, p: { head: [0.1, -0.1, 0.2] } },
      { t: 3, p: { spine: [0.02, 0, 0], head: [0.12, 0.08, 0.18], upperArmR: [-2.0, 0, 0.35], foreArmR: [-1.1, 0, 0.5], upperArmL: [-0.9, 0, -0.25], foreArmL: [-1.35, 0, -0.75] } },
    ],
  };
  defs.bow = {
    dur: 2,
    loop: false,
    keys: [
      { t: 0, p: { spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0], ...restArms } },
      { t: 0.6, p: { spine: [0.5, 0, 0], chest: [0.2, 0, 0], head: [0.2, 0, 0], upperArmL: [-0.25, 0, 0.1], upperArmR: [-0.25, 0, -0.1] } },
      { t: 1.3, p: { spine: [0.5, 0, 0], chest: [0.2, 0, 0], head: [0.2, 0, 0] } },
      { t: 2, p: { spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0], ...restArms } },
    ],
  };
  defs.dance = {
    dur: 0.9,
    loop: true,
    keys: cyclic(0.9, 8, (ph) => {
      const s = Math.sin(TAU * ph);
      const c = Math.cos(TAU * ph);
      const b = Math.abs(Math.sin(TAU * ph * 2));
      return {
        hipsY: H - 0.03 + 0.035 * b,
        hips: [0, 0.3 * s, 0.12 * c],
        upperLegL: [-0.4 * pos(s) - 0.1, 0, 0.12],
        lowerLegL: [0.7 * pos(s) + 0.15, 0, 0],
        upperLegR: [-0.4 * pos(-s) - 0.1, 0, -0.12],
        lowerLegR: [0.7 * pos(-s) + 0.15, 0, 0],
        spine: [0.05, -0.2 * s, -0.1 * c],
        chest: [0, -0.1 * s, 0],
        head: [-0.05, 0.25 * s, 0.15 * c],
        upperArmL: [-0.3, 0, 1.0 + 0.6 * pos(s)],
        upperArmR: [-0.3, 0, -1.0 - 0.6 * pos(-s)],
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
    if (['idle', 'walk', 'run', 'jump', 'sit', 'dance'].includes(name)) lower[name as LowerClip] = buildClip(`${name}_lower`, d.dur, d.keys, LOWER, true);
    upper[name as UpperClip] = buildClip(`${name}_upper`, d.dur, d.keys, UPPER, false);
  }
  cache = { lower, upper, face: faceClips(), loops };
  return cache;
}
