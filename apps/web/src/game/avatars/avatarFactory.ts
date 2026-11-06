/**
 * Procedural CHIBI avatar (big head, small body).
 * Builds a real THREE.Skeleton (17 body bones + 12 face bones) and ONE SkinnedMesh
 * with rigid skin weights and vertex colors → one draw call & one shared material
 * per avatar, cheap enough for 50 players.
 *
 * Facial expressions are driven by face bones (scale / position / rotation keyframes):
 * eyes, happy "^ ^" eyes, brows, smile / frown / open mouths, tears and blush.
 * Every face feature is part of the same mesh, so expressions cost no extra draw calls.
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { AVATAR_HEIGHT, type AvatarConfig, type BodyType } from '@xbrain/shared';

export const BODY_BONES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'upperArmL', 'foreArmL', 'handL', 'upperArmR', 'foreArmR', 'handR',
  'upperLegL', 'lowerLegL', 'footL', 'upperLegR', 'lowerLegR', 'footR',
] as const;
export const FACE_BONES = ['eyeL', 'eyeR', 'eyesHappy', 'browL', 'browR', 'mouthSmile', 'mouthFrown', 'mouthOpen', 'tears', 'blush', 'eyeShineL', 'eyeShineR'] as const;
export const BONE_NAMES = [...BODY_BONES, ...FACE_BONES] as const;
export type BoneName = (typeof BONE_NAMES)[number];
export type FaceBone = (typeof FACE_BONES)[number];
const BI = Object.fromEntries(BONE_NAMES.map((n, i) => [n, i])) as Record<BoneName, number>;

/** Hip height of the standing chibi rig (animations are authored against it). */
/*
 * Proportions. Parts are authored in a "design space" (taller body) and remapped at build
 * time into true chibi proportions (~2.5 heads tall): the torso & arms are squashed, the legs
 * become short and chubby, and the big head is simply lowered onto the round body.
 */
const AUTH_HIP = 0.62;
/** Torso / arm remap: design y → chibi y. */
const R = (y: number) => 0.3 + (y - 0.47) * 0.863;
const R_K = 0.863;
/** Leg remap: design y → chibi y. */
const LG = (y: number) => 0.05 + (y - 0.07) * 0.66;
const LG_K = 0.66;
/** The head keeps its size; it is lowered onto the shorter body. */
const HEAD_DY = 1.02 - R(0.98) - 0.035;
/** Hip height of the standing chibi rig (animations are authored against it). */
export const HIP_Y = R(AUTH_HIP);
/** Hip height when sitting on a 0.47 m seat (round bottom rests on the seat). */
export const SIT_HIP_Y = 0.6;
/** Head sphere: center (world, bind pose) and radius. */
const HC: V3 = [0, 1.235, 0];
const HR = 0.235;
const HEAD_BONE_Y = 1.02;

interface Dims {
  /** Shoulder joint x (arms hang just outside the round body). */
  sw: number;
  /** Hip joint x. */
  hw: number;
  /** Body width scale (x) and depth scale (z) of the lathe "bean". */
  bx: number;
  bz: number;
  /** Waist pinch (1 = none) and hip flare. */
  waist: number;
  hips: number;
}
const DIMS: Record<BodyType, Dims> = {
  masc: { sw: 0.178, hw: 0.07, bx: 1.22, bz: 0.92, waist: 1.0, hips: 1.0 },
  neutral: { sw: 0.17, hw: 0.072, bx: 1.16, bz: 0.92, waist: 0.97, hips: 1.02 },
  fem: { sw: 0.162, hw: 0.074, bx: 1.1, bz: 0.9, waist: 0.92, hips: 1.06 },
};

type V3 = [number, number, number];

/** Face bone bind positions (world) — also used by the animation generator. */
export const FACE_BIND: Record<FaceBone, V3> = {
  eyeL: [0.085, 1.245, 0.205],
  eyeR: [-0.085, 1.245, 0.205],
  eyeShineL: [0.085, 1.245, 0.205],
  eyeShineR: [-0.085, 1.245, 0.205],
  eyesHappy: [0, 1.25, 0.205],
  browL: [0.088, 1.335, 0.195],
  browR: [-0.088, 1.335, 0.195],
  mouthSmile: [0, 1.135, 0.214],
  mouthFrown: [0, 1.125, 0.214],
  mouthOpen: [0, 1.125, 0.212],
  tears: [0, 1.19, 0.2],
  blush: [0, 1.165, 0.19],
};
/** Face bone positions relative to the head bone (what the keyframe tracks animate). */
export const faceRel = (b: FaceBone): V3 => [FACE_BIND[b][0], FACE_BIND[b][1] - HEAD_BONE_Y, FACE_BIND[b][2]];

function boneDefs(d: Dims): Array<[BoneName, BoneName | null, V3]> {
  // World-space bind heights (chibi space), converted to parent-relative offsets below.
  const W: Record<string, number> = {
    hips: R(AUTH_HIP), spine: R(0.7), chest: R(0.84), neck: R(0.98), head: 1.02 - HEAD_DY,
    upperArm: R(0.95), foreArm: R(0.8), hand: R(0.67), upperLeg: LG(0.57), lowerLeg: LG(0.32), foot: LG(0.07),
  };
  const defs: Array<[BoneName, BoneName | null, V3]> = [
    ['hips', null, [0, W.hips, 0]],
    ['spine', 'hips', [0, W.spine - W.hips, 0]],
    ['chest', 'spine', [0, W.chest - W.spine, 0]],
    ['neck', 'chest', [0, W.neck - W.chest, 0]],
    ['head', 'neck', [0, W.head - W.neck, 0]],
    ['upperArmL', 'chest', [d.sw, W.upperArm - W.chest, 0]],
    ['foreArmL', 'upperArmL', [0, W.foreArm - W.upperArm, 0]],
    ['handL', 'foreArmL', [0, W.hand - W.foreArm, 0]],
    ['upperArmR', 'chest', [-d.sw, W.upperArm - W.chest, 0]],
    ['foreArmR', 'upperArmR', [0, W.foreArm - W.upperArm, 0]],
    ['handR', 'foreArmR', [0, W.hand - W.foreArm, 0]],
    ['upperLegL', 'hips', [d.hw, W.upperLeg - W.hips, 0]],
    ['lowerLegL', 'upperLegL', [0, W.lowerLeg - W.upperLeg, 0]],
    ['footL', 'lowerLegL', [0, W.foot - W.lowerLeg, 0]],
    ['upperLegR', 'hips', [-d.hw, W.upperLeg - W.hips, 0]],
    ['lowerLegR', 'upperLegR', [0, W.lowerLeg - W.upperLeg, 0]],
    ['footR', 'lowerLegR', [0, W.foot - W.lowerLeg, 0]],
  ];
  for (const b of FACE_BONES) defs.push([b, 'head', faceRel(b)]);
  return defs;
}

type Group = 'head' | 'torso' | 'leg' | 'foot';
const HEAD_GROUP = new Set<string>(['head', ...FACE_BONES]);
function groupOf(b: BoneName): Group {
  if (HEAD_GROUP.has(b)) return 'head';
  if (b.startsWith('upperLeg') || b.startsWith('lowerLeg')) return 'leg';
  if (b.startsWith('foot')) return 'foot';
  return 'torso';
}

/** Move design-space geometry into chibi space (y remap + matching normal correction). */
function remap(g: THREE.BufferGeometry, group: Group) {
  const P = g.attributes.position as THREE.BufferAttribute;
  const N = g.attributes.normal as THREE.BufferAttribute | undefined;
  const k = group === 'torso' ? R_K : group === 'leg' ? LG_K : 1;
  for (let i = 0; i < P.count; i++) {
    const y = P.getY(i);
    P.setY(i, group === 'torso' ? R(y) : group === 'leg' ? LG(y) : group === 'head' ? y - HEAD_DY : y - 0.02);
    if (N && k !== 1) {
      const nx = N.getX(i);
      const ny = N.getY(i) / k;
      const nz = N.getZ(i);
      const l = Math.hypot(nx, ny, nz) || 1;
      N.setXYZ(i, nx / l, ny / l, nz / l);
    }
  }
  P.needsUpdate = true;
}

class Parts {
  geos: THREE.BufferGeometry[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  /**
   * Soft-skinned part: colour and bone weights are computed per vertex from its bind-pose
   * position, so limbs bend smoothly instead of looking like jointed segments.
   */
  addSoft(geo: THREE.BufferGeometry, color: (x: number, y: number, z: number) => THREE.Color, weights: (x: number, y: number, z: number) => Array<[BoneName, number]>, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]) {
    const g = geo.index ? geo : mergeVertices(geo);
    g.deleteAttribute('uv');
    this.e.set(rot[0], rot[1], rot[2]);
    this.q.setFromEuler(this.e);
    this.m.compose(new THREE.Vector3(...pos), this.q, new THREE.Vector3(...scale));
    g.applyMatrix4(this.m);
    const P = g.attributes.position as THREE.BufferAttribute;
    const n = P.count;
    const colors = new Float32Array(n * 3);
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const x = P.getX(i);
      const y = P.getY(i);
      const z = P.getZ(i);
      const c = color(x, y, z);
      colors.set([c.r, c.g, c.b], i * 3);
      const w = weights(x, y, z).filter(([, v]) => v > 1e-4).slice(0, 4);
      const tot = w.reduce((a, [, v]) => a + v, 0) || 1;
      w.forEach(([b, v], k) => {
        si[i * 4 + k] = BI[b];
        sw[i * 4 + k] = v / tot;
      });
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    remap(g, groupOf(BONE_NAMES[si[0]] as BoneName));
    this.geos.push(g);
  }

  add(geo: THREE.BufferGeometry, bone: BoneName, color: THREE.ColorRepresentation, pos: V3, rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]) {
    const g = geo.index ? geo : mergeVertices(geo);
    g.deleteAttribute('uv');
    this.e.set(rot[0], rot[1], rot[2]);
    this.q.setFromEuler(this.e);
    this.m.compose(new THREE.Vector3(...pos), this.q, new THREE.Vector3(...scale));
    g.applyMatrix4(this.m);
    const n = g.attributes.position.count;
    const c = new THREE.Color(color);
    const colors = new Float32Array(n * 3);
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    const b = BI[bone];
    for (let i = 0; i < n; i++) {
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      si[i * 4] = b;
      sw[i * 4] = 1;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    remap(g, groupOf(bone));
    this.geos.push(g);
  }
}

const sphere = (r: number, ws = 14, hs = 10, phiStart = 0, phiLen = Math.PI * 2, thStart = 0, thLen = Math.PI) =>
  new THREE.SphereGeometry(r, ws, hs, phiStart, phiLen, thStart, thLen);
const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 10);
const cyl = (rt: number, rb: number, h: number, seg = 12, open = false, ts = 0, tl = Math.PI * 2) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, ts, tl);
const rbox = (w: number, h: number, d: number, r = 0.03) => {
  const g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
  g.deleteAttribute('uv');
  return mergeVertices(g);
};
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const torus = (r: number, t: number, rs = 6, ts = 16, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc);

const shade = (hex: string, k: number) => new THREE.Color(hex).multiplyScalar(k);
const mix = (a: string, b: string, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t);
/** Point on the head surface (front hemisphere) at the given x / y. */
const onHead = (x: number, y: number, lift = 0): V3 => {
  const dy = (y - HC[1]) / 0.97;
  const z = Math.sqrt(Math.max(0, HR * HR - x * x - dy * dy)) * 0.96;
  return [x, y, z + lift];
};

function buildParts(cfg: AvatarConfig, d: Dims): Parts {
  const P = new Parts();
  const skin = cfg.skin;
  const top = cfg.topColor;
  const bottom = cfg.bottomColor;
  const hair = cfg.hairColor;
  const longSleeve = cfg.top === 'shirt' || cfg.top === 'hoodie' || cfg.top === 'blazer';

  // ════════════════ Soft chibi body (no visible joints) ════════════════
  const C = (hex: THREE.ColorRepresentation) => new THREE.Color(hex);
  const smooth = (a: number, b: number, v: number) => {
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const blend = (lo: BoneName, hi: BoneName, y0: number, y1: number) => (_x: number, y: number): Array<[BoneName, number]> => {
    const t = smooth(y0, y1, y);
    return [[lo, 1 - t], [hi, t]];
  };
  const topC = C(top);
  const topDark = shade(top, 0.8);
  const botC = C(bottom);
  const skinC = C(skin);
  const hoodie = cfg.top === 'hoodie';
  const blazer = cfg.top === 'blazer';
  /** Height where the top meets the bottom garment. */
  const WAIST = hoodie ? 0.6 : 0.655;

  // Round "bean" torso: one smooth lathe from the hips to the neck.
  const prof: Array<[number, number]> = [
    [0.001, 0.47], [0.06, 0.474], [0.1, 0.488], [0.128, 0.515], [0.142 * d.hips, 0.555], [0.149 * d.hips, 0.6],
    [0.148, WAIST - 0.006], [0.147, WAIST + 0.006], [0.144 * d.waist, 0.7], [0.142 * d.waist, 0.75], [0.141, 0.8],
    [0.137, 0.85], [0.126, 0.895], [0.106, 0.93], [0.08, 0.955], [0.05, 0.97], [0.02, 0.978], [0.001, 0.98],
  ];
  const bean = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28);
  P.addSoft(
    bean,
    (x, y, z) => {
      if (y < WAIST) {
        if (hoodie && y > WAIST - 0.035) return C(shade(top, 0.82)); // ribbed hem
        return cfg.bottom === 'skirt' ? C(bottom) : botC;
      }
      if (hoodie && y > 0.6 && y < 0.625) return C(shade(top, 0.82));
      // Blazer: open front shows the white shirt in a V
      if (blazer && z > 0.04 && y > 0.76 && Math.abs(x) < 0.01 + (y - 0.76) * 0.26) return C('#f5f5f2');
      // Shirt / polo placket
      if ((cfg.top === 'shirt' || cfg.top === 'polo') && z > 0.05 && Math.abs(x) < 0.008 && y > 0.7) return C(shade(top, 0.9));
      return topC;
    },
    (x, y) => {
      const a = smooth(0.62, 0.7, y);
      const b = smooth(0.78, 0.86, y);
      return [['hips', 1 - a], ['spine', a * (1 - b)], ['chest', b]];
    },
    [0, 0, 0],
    [0, 0, 0],
    [d.bx, 1, d.bz],
  );
  // Front surface depth of the bean (garment details sit on it)
  const zf = (y: number) => (y > 0.9 ? 0.118 : 0.142) * d.bz + 0.004;
  // Belt with a golden buckle
  if (!hoodie) {
    P.add(torus(0.147, 0.011, 6, 28), 'hips', shade(bottom, 0.5), [0, WAIST, 0], [Math.PI / 2, 0, 0], [d.bx, d.bz, 1]);
    P.add(rbox(0.04, 0.026, 0.012, 0.005), 'hips', '#e0b85a', [0, WAIST, 0.147 * d.bz + 0.006]);
  }

  // ── Garment details ──
  if (cfg.top === 'shirt' || cfg.top === 'polo') {
    const collar = cfg.top === 'shirt' ? '#ffffff' : shade(top, 0.82);
    for (const s of [1, -1]) P.add(rbox(0.07, 0.012, 0.045, 0.006), 'chest', collar, [s * 0.034, 0.952, 0.07], [0.55, s * 0.5, s * 0.55]);
    const nB = cfg.top === 'shirt' ? 3 : 2;
    for (let i = 0; i < nB; i++) P.add(sphere(0.007, 6, 4), 'chest', shade(top, 0.62), [0, 0.9 - i * 0.055, zf(0.9) + 0.003]);
    if (cfg.top === 'shirt') {
      // Slim XBrain-orange tie
      P.add(rbox(0.026, 0.02, 0.012, 0.005), 'chest', '#c2410c', [0, 0.935, zf(0.93) + 0.006]);
      P.add(rbox(0.03, 0.13, 0.008, 0.006), 'chest', '#e5622a', [0, 0.855, zf(0.85) + 0.008], [0.08, 0, 0]);
    } else P.add(rbox(0.03, 0.03, 0.006, 0.006), 'chest', '#f7941d', [0.075, 0.875, zf(0.87) + 0.002]);
  } else if (blazer) {
    for (const s of [1, -1]) {
      P.add(rbox(0.05, 0.19, 0.01, 0.006), 'chest', shade(top, 0.78), [s * 0.04, 0.85, zf(0.85) + 0.004], [0.06, 0, s * 0.32]);
    }
    P.add(rbox(0.024, 0.11, 0.008, 0.005), 'chest', '#1a1d24', [0, 0.86, zf(0.86) + 0.006]);
    P.add(rbox(0.036, 0.022, 0.008, 0.004), 'chest', '#f7941d', [0.09, 0.885, zf(0.88) + 0.003]);
    for (let i = 0; i < 2; i++) P.add(sphere(0.008, 6, 4), 'spine', '#1a1d24', [0.02, 0.73 - i * 0.045, zf(0.73) + 0.004]);
  } else if (hoodie) {
    P.add(torus(0.075, 0.032, 8, 18, Math.PI * 1.25), 'chest', shade(top, 0.85), [0, 0.955, -0.035], [Math.PI / 2 + 0.55, 0, -Math.PI * 0.125]);
    P.add(rbox(0.17, 0.075, 0.03, 0.02), 'spine', shade(top, 0.9), [0, 0.705, zf(0.7) - 0.004]);
    for (const s of [1, -1]) {
      P.add(cyl(0.004, 0.004, 0.09, 6), 'chest', '#ffffff', [s * 0.028, 0.885, zf(0.88) + 0.004]);
      P.add(sphere(0.008, 6, 4), 'chest', '#ffffff', [s * 0.028, 0.835, zf(0.83) + 0.004]);
    }
  } else {
    // T-shirt: ribbed crew neck + XBrain "X" print
    P.add(torus(0.05, 0.009, 6, 16), 'chest', shade(top, 0.82), [0, 0.962, 0.008], [Math.PI / 2 + 0.25, 0, 0]);
    for (const s of [1, -1]) P.add(rbox(0.022, 0.085, 0.006, 0.008), 'chest', s === 1 ? '#f7941d' : '#e5622a', [0, 0.855, zf(0.85) + 0.003], [0.05, 0, s * 0.62]);
  }
  if (cfg.badge) {
    P.add(box(0.008, 0.13, 0.004), 'chest', '#22262e', [0.03, 0.89, zf(0.89) + 0.005], [0.1, 0, 0.24]);
    P.add(box(0.008, 0.13, 0.004), 'chest', '#22262e', [-0.03, 0.89, zf(0.89) + 0.005], [0.1, 0, -0.24]);
    P.add(rbox(0.046, 0.06, 0.007, 0.006), 'chest', '#ffffff', [0, 0.805, zf(0.8) + 0.009]);
    P.add(box(0.046, 0.014, 0.008), 'chest', '#f7941d', [0, 0.826, zf(0.82) + 0.01]);
  }
  if (cfg.bottom === 'skirt') {
    // Pleated skirt: flared lathe with alternating pleat shading
    const sk = new THREE.LatheGeometry([new THREE.Vector2(0.15, WAIST + 0.01), new THREE.Vector2(0.17, 0.6), new THREE.Vector2(0.2, 0.52), new THREE.Vector2(0.215, 0.47)], 32);
    P.addSoft(sk, (x, _y, z) => (Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 16) % 2 ? C(bottom) : C(shade(bottom, 0.85))), () => [['hips', 1]], [0, 0, 0], [0, 0, 0], [d.bx, 1, d.bz]);
  }

  // ── Stubby arms: one smooth tapered piece each, bending softly at the elbow ──
  const sleeveLong = cfg.top === 'shirt' || hoodie || blazer;
  for (const s of [1, -1] as const) {
    const L = s === 1;
    const x = s * d.sw;
    const ua: BoneName = L ? 'upperArmL' : 'upperArmR';
    const fa: BoneName = L ? 'foreArmL' : 'foreArmR';
    const hand: BoneName = L ? 'handL' : 'handR';
    const arm = new THREE.CapsuleGeometry(0.05, 0.21, 6, 14);
    P.addSoft(
      arm,
      (_x, y) => {
        if (sleeveLong) return y < 0.705 ? C(blazer ? '#f5f5f2' : shade(top, 0.82)) : topC;
        return y > 0.845 ? (y < 0.858 ? C(shade(top, 0.82)) : topC) : skinC;
      },
      blend(fa, ua, 0.77, 0.83),
      [x, 0.82, 0],
      [0, 0, 0],
      [1, 1, 0.95],
    );
    // Round mitten hand + tiny thumb
    P.add(sphere(0.052, 14, 10), hand, skin, [x, 0.648, 0.006], [0, 0, 0], [0.92, 1.0, 0.86]);
    P.add(sphere(0.022, 8, 6), hand, skin, [x - s * 0.035, 0.66, 0.03]);
  }

  // ── Short round legs: smooth tube from inside the body down to the shoes ──
  for (const s of [1, -1] as const) {
    const L = s === 1;
    const x = s * d.hw;
    const ul: BoneName = L ? 'upperLegL' : 'upperLegR';
    const ll: BoneName = L ? 'lowerLegL' : 'lowerLegR';
    const leg = new THREE.CapsuleGeometry(0.068, 0.3, 6, 14);
    P.addSoft(
      leg,
      (_x, y) => {
        if (cfg.bottom === 'pants') return y < 0.135 ? C(shade(bottom, 0.82)) : botC; // turned-up cuff
        if (cfg.bottom === 'shorts') return y > 0.375 ? botC : y > 0.36 ? C(shade(bottom, 0.8)) : y < 0.13 ? C('#f4f4f2') : skinC;
        return y < 0.13 ? C('#f4f4f2') : skinC; // skirt: socks
      },
      blend(ll, ul, 0.29, 0.36),
      [x, 0.33, 0],
      [0, 0, 0],
      [1, 1, 0.96],
    );
    // Cute rounded shoes
    const foot: BoneName = L ? 'footL' : 'footR';
    const sh = cfg.shoesColor;
    const tall = cfg.shoes === 'boots';
    P.add(sphere(0.07, 16, 12), foot, sh, [x, 0.055, 0.03], [0, 0, 0], [0.92, tall ? 0.95 : 0.72, 1.45]);
    if (tall) P.add(cyl(0.064, 0.068, 0.1, 16), foot, sh, [x, 0.11, -0.005]);
    const sole = cfg.shoes === 'formal' ? '#2a1d16' : cfg.shoes === 'boots' ? '#3a2a20' : '#fafafa';
    P.add(cyl(0.064, 0.064, 0.02, 16), foot, sole, [x, 0.012, 0.03], [0, 0, 0], [0.98, 1, 1.5]);
    if (cfg.shoes === 'sneakers') {
      P.add(rbox(0.05, 0.012, 0.05, 0.005), foot, '#ffffff', [x, 0.09, 0.055], [0.5, 0, 0]);
      P.add(sphere(0.012, 6, 5), foot, '#f7941d', [x + s * 0.062, 0.05, 0.03], [0, 0, 0], [0.4, 1, 1.6]);
    }
    if (cfg.shoes === 'formal') P.add(sphere(0.02, 8, 6), foot, '#ffffff', [x + s * 0.02, 0.085, 0.07], [0, 0, 0], [1, 0.4, 1]);
  }

  // ── Head (big!) ──
  P.add(cyl(0.05, 0.055, 0.05), 'neck', skin, [0, 0.99, 0]);
  P.add(sphere(HR, 24, 18), 'head', skin, HC, [0, 0, 0], [1.0, 0.97, 0.96]);
  P.add(sphere(0.04, 8, 6), 'head', skin, [0.228, 1.225, -0.01], [0, 0, 0], [0.5, 1, 0.85]);
  P.add(sphere(0.04, 8, 6), 'head', skin, [-0.228, 1.225, -0.01], [0, 0, 0], [0.5, 1, 0.85]);
  P.add(sphere(0.013, 8, 6), 'head', shade(skin, 0.9), onHead(0, 1.19, 0.004));

  // Eyes — big glossy chibi eyes (face style changes shape)
  const f = cfg.face;
  const eyeSY = f === 'calm' ? 0.75 : f === 'serious' ? 0.85 : f === 'bright' ? 1.18 : 1.05;
  const irisCol = f === 'bright' ? '#5b3a24' : '#2a1d18';
  for (const s of [1, -1] as const) {
    const bone: BoneName = s === 1 ? 'eyeL' : 'eyeR';
    const shine: BoneName = s === 1 ? 'eyeShineL' : 'eyeShineR';
    const c = FACE_BIND[bone];
    P.add(sphere(0.046, 14, 10), bone, '#ffffff', [c[0], c[1], c[2] - 0.004], [0, 0, 0], [0.86, 1.05 * eyeSY, 0.42]);
    P.add(sphere(0.037, 14, 10), bone, irisCol, [c[0], c[1] - 0.004, c[2] + 0.008], [0, 0, 0], [0.86, 1.08 * eyeSY, 0.45]);
    P.add(sphere(0.019, 10, 8), bone, '#0d0a09', [c[0], c[1] - 0.004, c[2] + 0.014], [0, 0, 0], [0.9, 1.1 * eyeSY, 0.45]);
    P.add(sphere(0.011, 8, 6), shine, '#ffffff', [c[0] + 0.012 * s, c[1] + 0.014, c[2] + 0.02], [0, 0, 0], [1, 1, 0.5]);
    if (f === 'cheerful' || f === 'friendly') P.add(box(0.05, 0.007, 0.01), bone, '#1d1715', [c[0] + 0.006 * s, c[1] + 0.045 * eyeSY, c[2] + 0.004], [0, 0, s * -0.25]);
    // Happy closed "^ ^" eyes (hidden unless an expression scales them up)
    P.add(torus(0.032, 0.0075, 5, 12, Math.PI), 'eyesHappy', '#2a1d18', [c[0], c[1] - 0.01, c[2] + 0.018]);
    // Brows
    const brow: BoneName = s === 1 ? 'browL' : 'browR';
    const bc = FACE_BIND[brow];
    P.add(rbox(0.06, 0.013, 0.012, 0.005), brow, shade(hair, 0.9), [bc[0], bc[1], bc[2]], [0, 0, s * (f === 'serious' ? 0.15 : -0.06)]);
    // Blush + tears
    P.add(sphere(0.03, 10, 6), 'blush', mix(skin, '#ff7d8a', 0.6), onHead(s * 0.13, 1.165, -0.006), [0, s * 0.45, 0], [1.25, 0.6, 0.3]);
    P.add(sphere(0.016, 8, 6), 'tears', '#7cc6ff', onHead(s * 0.1, 1.19, 0.006), [0, 0, 0], [0.7, 1.7, 0.5]);
    P.add(sphere(0.012, 8, 6), 'tears', '#a8dcff', onHead(s * 0.105, 1.15, 0.008), [0, 0, 0], [0.7, 1.4, 0.5]);
  }
  if (f === 'bright' || f === 'cheerful') for (const s of [1, -1]) P.add(sphere(0.024, 8, 6), 'head', mix(skin, '#ff9aa5', 0.35), onHead(s * 0.13, 1.17, -0.007), [0, s * 0.45, 0], [1.2, 0.55, 0.3]);

  // Mouths: smile arc, frown arc, open mouth (scaled by expressions)
  P.add(torus(0.032, 0.0075, 5, 14, Math.PI), 'mouthSmile', '#8f3f3a', FACE_BIND.mouthSmile, [0, 0, Math.PI]);
  P.add(torus(0.028, 0.007, 5, 14, Math.PI), 'mouthFrown', '#8f3f3a', [FACE_BIND.mouthFrown[0], FACE_BIND.mouthFrown[1] - 0.018, FACE_BIND.mouthFrown[2]]);
  P.add(sphere(0.034, 12, 8), 'mouthOpen', '#7a2b2e', FACE_BIND.mouthOpen, [0, 0, 0], [1, 0.8, 0.3]);
  P.add(sphere(0.02, 8, 6), 'mouthOpen', '#e36b74', [0, FACE_BIND.mouthOpen[1] - 0.014, FACE_BIND.mouthOpen[2] + 0.004], [0, 0, 0], [1.1, 0.5, 0.3]);

  // Beard (stylized)
  if (cfg.beard !== 'none') {
    const bcol = cfg.beard === 'stubble' ? mix(skin, hair, 0.4) : hair;
    const th = cfg.beard === 'full' ? 1.045 : 1.012;
    P.add(sphere(HR, 18, 10, 0, Math.PI * 2, 2.15, 0.95), 'head', bcol, HC, [0, 0, 0], [1.0 * th, 0.97 * th, 0.96 * th]);
  }

  // Hair — puffy chibi hair volumes
  const capR = cfg.hair === 'buzz' || cfg.hair === 'mohawk' ? HR + 0.007 : HR + 0.022;
  const capRot: V3 = [-0.42, 0, 0];
  const cap = (thLen = 1.45, r = capR) => P.add(sphere(r, 24, 12, 0, Math.PI * 2, 0, thLen), 'head', hair, [0, HC[1] + 0.012, -0.004], capRot, [1.02, 1.0, 1.02]);
  const fringe = () => {
    for (let i = -2; i <= 2; i++) P.add(sphere(0.06, 10, 8), 'head', hair, [i * 0.055, 1.38 - Math.abs(i) * 0.012, 0.165 - Math.abs(i) * 0.02], [0.4, 0, 0], [1.0, 0.75, 0.7]);
  };
  switch (cfg.hair) {
    case 'short':
      cap();
      fringe();
      break;
    case 'buzz':
      cap(1.4);
      break;
    case 'side':
      cap();
      P.add(rbox(0.26, 0.06, 0.1, 0.03), 'head', hair, [0.03, 1.39, 0.15], [0.45, 0, -0.32]);
      break;
    case 'long':
      cap(1.6);
      fringe();
      P.add(rbox(0.38, 0.34, 0.1, 0.05), 'head', hair, [0, 1.12, -0.17]);
      P.add(rbox(0.07, 0.3, 0.12, 0.03), 'head', hair, [0.215, 1.13, -0.01]);
      P.add(rbox(0.07, 0.3, 0.12, 0.03), 'head', hair, [-0.215, 1.13, -0.01]);
      break;
    case 'bob':
      cap(1.6);
      fringe();
      P.add(cyl(0.255, 0.27, 0.2, 22, true, Math.PI * 0.72, Math.PI * 1.56), 'head', hair, [0, 1.17, -0.005]);
      break;
    case 'bun':
      cap(1.5);
      fringe();
      P.add(sphere(0.095, 12, 10), 'head', hair, [0, 1.49, -0.12]);
      break;
    case 'ponytail':
      cap(1.5);
      fringe();
      P.add(sphere(0.04, 8, 6), 'head', shade(hair, 0.7), [0, 1.33, -0.235]);
      P.add(capsule(0.06, 0.2), 'head', hair, [0, 1.17, -0.27], [0.4, 0, 0]);
      break;
    case 'curly': {
      cap(1.45);
      const pts: V3[] = [[0, 1.5, 0], [0.12, 1.47, 0.05], [-0.12, 1.47, 0.05], [0.1, 1.46, -0.12], [-0.1, 1.46, -0.12], [0, 1.46, 0.14], [0.2, 1.38, -0.04], [-0.2, 1.38, -0.04], [0, 1.42, -0.19], [0.09, 1.43, 0.13], [-0.09, 1.43, 0.13], [0.18, 1.3, -0.14], [-0.18, 1.3, -0.14]];
      for (const p of pts) P.add(sphere(0.075, 9, 7), 'head', hair, p);
      break;
    }
    case 'mohawk':
      cap(1.4);
      P.add(rbox(0.055, 0.12, 0.36, 0.025), 'head', hair, [0, 1.49, -0.02], [-0.15, 0, 0]);
      break;
    case 'bald':
      break;
  }

  // Headwear
  const hw = cfg.headwearColor;
  if (cfg.headwear === 'cap') {
    P.add(sphere(HR + 0.03, 24, 12, 0, Math.PI * 2, 0, 1.35), 'head', hw, [0, HC[1] + 0.02, -0.005], [-0.22, 0, 0], [1.02, 1.0, 1.04]);
    P.add(rbox(0.27, 0.02, 0.17, 0.008), 'head', shade(hw, 0.85), [0, 1.36, 0.24], [0.15, 0, 0]);
    P.add(box(0.06, 0.035, 0.008), 'head', '#f7941d', [0, 1.44, 0.215], [-0.55, 0, 0]);
  } else if (cfg.headwear === 'beanie') {
    P.add(sphere(HR + 0.034, 24, 12, 0, Math.PI * 2, 0, 1.5), 'head', hw, [0, HC[1] + 0.03, -0.005], [-0.18, 0, 0], [1.02, 1.12, 1.03]);
    P.add(torus(HR + 0.02, 0.026, 6, 24), 'head', shade(hw, 0.8), [0, 1.335, 0.0], [Math.PI / 2 - 0.18, 0, 0]);
    P.add(sphere(0.05, 8, 6), 'head', shade(hw, 1.1), [0, 1.58, -0.04]);
  } else if (cfg.headwear === 'headphones') {
    P.add(torus(HR + 0.03, 0.016, 6, 22, Math.PI), 'head', '#22252b', [0, HC[1] + 0.01, 0]);
    for (const s of [1, -1]) P.add(cyl(0.06, 0.06, 0.05, 16), 'head', hw, [s * (HR + 0.02), 1.225, 0], [0, 0, Math.PI / 2]);
  }

  // Glasses (big round chibi frames around the eyes)
  if (cfg.glasses !== 'none') {
    const frame = '#1b1b1f';
    const round = cfg.glasses === 'round';
    for (const s of [1, -1]) {
      const c = FACE_BIND[s === 1 ? 'eyeL' : 'eyeR'];
      P.add(torus(round ? 0.058 : 0.064, 0.0065, 4, round ? 18 : 4), 'head', frame, [c[0], c[1], c[2] + 0.03], [0, 0, round ? 0 : Math.PI / 4]);
      P.add(box(0.006, 0.006, 0.16), 'head', frame, [s * 0.15, 1.25, 0.12]);
    }
    P.add(box(0.05, 0.007, 0.007), 'head', frame, [0, 1.255, 0.225]);
  }
  if (cfg.earrings) for (const s of [1, -1]) P.add(sphere(0.012, 6, 5), 'head', '#e8c25a', [s * 0.232, 1.18, 0.0]);
  return P;
}

// ───────────────────────────── public API ─────────────────────────────
export const avatarMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.0 });

const geoCache = new Map<string, { geo: THREE.BufferGeometry; refs: number }>();

export const avatarKey = (cfg: AvatarConfig) => JSON.stringify(cfg);

function getGeometry(cfg: AvatarConfig): THREE.BufferGeometry {
  const key = avatarKey(cfg);
  const hit = geoCache.get(key);
  if (hit) {
    hit.refs++;
    return hit.geo;
  }
  const parts = buildParts(cfg, DIMS[cfg.body]);
  const geo = mergeGeometries(parts.geos, false)!;
  parts.geos.forEach((g) => g.dispose());
  geo.computeBoundingSphere();
  geoCache.set(key, { geo, refs: 1 });
  return geo;
}

export function releaseGeometry(cfg: AvatarConfig) {
  const key = avatarKey(cfg);
  const hit = geoCache.get(key);
  if (!hit) return;
  hit.refs--;
  if (hit.refs <= 0) {
    hit.geo.dispose();
    geoCache.delete(key);
  }
}

export interface AvatarRig {
  root: THREE.Group;
  mesh: THREE.SkinnedMesh;
  bones: Record<BoneName, THREE.Bone>;
  height: number;
  dispose: () => void;
}

export function createAvatar(cfg: AvatarConfig, opts: { castShadow?: boolean } = {}): AvatarRig {
  const d = DIMS[cfg.body];
  const bones = {} as Record<BoneName, THREE.Bone>;
  for (const [name, parent, off] of boneDefs(d)) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(...off);
    bones[name] = b;
    if (parent) bones[parent].add(b);
  }
  const geo = getGeometry(cfg);
  const mesh = new THREE.SkinnedMesh(geo, avatarMaterial);
  mesh.add(bones.hips);
  bones.hips.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(BONE_NAMES.map((n) => bones[n]));
  mesh.bind(skeleton);
  mesh.castShadow = !!opts.castShadow;
  mesh.receiveShadow = false;
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.62, 0), 0.9);
  mesh.frustumCulled = true;
  const root = new THREE.Group();
  root.add(mesh);
  root.scale.setScalar(cfg.height);
  return {
    root,
    mesh,
    bones,
    height: AVATAR_HEIGHT * cfg.height,
    dispose: () => {
      skeleton.dispose();
      releaseGeometry(cfg);
    },
  };
}
