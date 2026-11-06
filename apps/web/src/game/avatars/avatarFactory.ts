/**
 * Procedural rigged avatar.
 * Builds a real THREE.Skeleton (17 bones) and a single SkinnedMesh with rigid
 * skin weights and vertex colors → one draw call & one shared material per avatar.
 * Any AvatarConfig change rebuilds the geometry (cached by config key).
 *
 * A GLB avatar (e.g. Mixamo-rigged) can replace this later: the animation layer
 * only relies on the bone names exported below.
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { AvatarConfig, BodyType } from '@xbrain/shared';

export const BONE_NAMES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'upperArmL', 'foreArmL', 'handL', 'upperArmR', 'foreArmR', 'handR',
  'upperLegL', 'lowerLegL', 'footL', 'upperLegR', 'lowerLegR', 'footR',
] as const;
export type BoneName = (typeof BONE_NAMES)[number];
const BI = Object.fromEntries(BONE_NAMES.map((n, i) => [n, i])) as Record<BoneName, number>;

interface Dims {
  sw: number;
  hw: number;
  torsoW: number;
  waistW: number;
  hipsW: number;
}
const DIMS: Record<BodyType, Dims> = {
  masc: { sw: 0.235, hw: 0.095, torsoW: 0.4, waistW: 0.35, hipsW: 0.33 },
  neutral: { sw: 0.218, hw: 0.1, torsoW: 0.37, waistW: 0.33, hipsW: 0.35 },
  fem: { sw: 0.2, hw: 0.104, torsoW: 0.34, waistW: 0.29, hipsW: 0.37 },
};

type V3 = [number, number, number];

function boneDefs(d: Dims): Array<[BoneName, BoneName | null, V3]> {
  return [
    ['hips', null, [0, 0.95, 0]],
    ['spine', 'hips', [0, 0.1, 0]],
    ['chest', 'spine', [0, 0.2, 0]],
    ['neck', 'chest', [0, 0.22, 0]],
    ['head', 'neck', [0, 0.08, 0]],
    ['upperArmL', 'chest', [d.sw, 0.17, 0]],
    ['foreArmL', 'upperArmL', [0, -0.27, 0]],
    ['handL', 'foreArmL', [0, -0.24, 0]],
    ['upperArmR', 'chest', [-d.sw, 0.17, 0]],
    ['foreArmR', 'upperArmR', [0, -0.27, 0]],
    ['handR', 'foreArmR', [0, -0.24, 0]],
    ['upperLegL', 'hips', [d.hw, -0.06, 0]],
    ['lowerLegL', 'upperLegL', [0, -0.42, 0]],
    ['footL', 'lowerLegL', [0, -0.4, 0]],
    ['upperLegR', 'hips', [-d.hw, -0.06, 0]],
    ['lowerLegR', 'upperLegR', [0, -0.42, 0]],
    ['footR', 'lowerLegR', [0, -0.4, 0]],
  ];
}

class Parts {
  geos: THREE.BufferGeometry[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

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
  return mergeVertices(g); // RoundedBoxGeometry is non-indexed; index it so it merges with the other primitives
};
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const torus = (r: number, t: number, rs = 6, ts = 16, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc);

const shade = (hex: string, k: number) => new THREE.Color(hex).multiplyScalar(k);
const mix = (a: string, b: string, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t);

function buildParts(cfg: AvatarConfig, d: Dims): Parts {
  const P = new Parts();
  const skin = cfg.skin;
  const top = cfg.topColor;
  const bottom = cfg.bottomColor;
  const hair = cfg.hairColor;
  const longSleeve = cfg.top === 'shirt' || cfg.top === 'hoodie' || cfg.top === 'blazer';
  const headC: V3 = [0, 1.645, 0];

  // ── Torso ──
  P.add(rbox(d.hipsW, 0.2, 0.22, 0.06), 'hips', bottom, [0, 0.95, 0]);
  P.add(rbox(d.waistW, 0.24, 0.21, 0.07), 'spine', top, [0, 1.13, 0]);
  P.add(rbox(d.torsoW, 0.27, 0.23, 0.08), 'chest', top, [0, 1.355, 0]);
  P.add(sphere(0.066), 'chest', top, [d.sw - 0.005, 1.425, 0]);
  P.add(sphere(0.066), 'chest', top, [-d.sw + 0.005, 1.425, 0]);
  if (cfg.body === 'fem') {
    P.add(sphere(0.06, 10, 8), 'chest', top, [0.07, 1.34, 0.085], [0, 0, 0], [1, 0.85, 0.7]);
    P.add(sphere(0.06, 10, 8), 'chest', top, [-0.07, 1.34, 0.085], [0, 0, 0], [1, 0.85, 0.7]);
  }
  // Belt line
  if (cfg.top !== 'hoodie') P.add(box(d.hipsW + 0.005, 0.03, 0.225), 'hips', shade(bottom, 0.55), [0, 1.03, 0]);

  // ── Top details ──
  if (cfg.top === 'shirt' || cfg.top === 'polo') {
    const collar = cfg.top === 'shirt' ? shade(top, 0.92) : shade(top, 0.8);
    P.add(box(0.07, 0.05, 0.02), 'chest', collar, [0.045, 1.475, 0.1], [0.3, 0, -0.5]);
    P.add(box(0.07, 0.05, 0.02), 'chest', collar, [-0.045, 1.475, 0.1], [0.3, 0, 0.5]);
    for (let i = 0; i < (cfg.top === 'shirt' ? 4 : 2); i++) P.add(sphere(0.007, 6, 4), 'chest', shade(top, 0.6), [0, 1.43 - i * 0.07, 0.117]);
  } else if (cfg.top === 'blazer') {
    P.add(box(0.1, 0.22, 0.01), 'chest', '#f5f5f2', [0, 1.38, 0.112]);
    P.add(box(0.03, 0.17, 0.012), 'chest', '#1a1d24', [0, 1.36, 0.118]);
    P.add(box(0.05, 0.22, 0.012), 'chest', shade(top, 0.85), [0.07, 1.39, 0.116], [0, 0, 0.18]);
    P.add(box(0.05, 0.22, 0.012), 'chest', shade(top, 0.85), [-0.07, 1.39, 0.116], [0, 0, -0.18]);
  } else if (cfg.top === 'hoodie') {
    P.add(torus(0.1, 0.035, 6, 14, Math.PI), 'chest', shade(top, 0.85), [0, 1.47, -0.04], [Math.PI / 2 + 0.4, 0, 0]);
    P.add(rbox(0.2, 0.09, 0.03, 0.012), 'spine', shade(top, 0.88), [0, 1.08, 0.105]);
    P.add(box(0.008, 0.12, 0.008), 'chest', '#eeeeee', [0.04, 1.4, 0.117]);
    P.add(box(0.008, 0.12, 0.008), 'chest', '#eeeeee', [-0.04, 1.4, 0.117]);
    P.add(rbox(d.hipsW + 0.01, 0.1, 0.225, 0.04), 'hips', top, [0, 1.0, 0]);
  } else {
    // T-shirt: crew neck trim
    P.add(torus(0.06, 0.012, 5, 14), 'chest', shade(top, 0.85), [0, 1.475, 0.01], [Math.PI / 2, 0, 0]);
  }
  if (cfg.badge) {
    P.add(box(0.012, 0.2, 0.006), 'chest', '#22262e', [0.045, 1.38, 0.117], [0, 0, 0.2]);
    P.add(box(0.012, 0.2, 0.006), 'chest', '#22262e', [-0.045, 1.38, 0.117], [0, 0, -0.2]);
    P.add(box(0.055, 0.075, 0.008), 'chest', '#ffffff', [0, 1.26, 0.12]);
    P.add(box(0.055, 0.018, 0.009), 'chest', '#f7941d', [0, 1.288, 0.121]);
  }

  // ── Arms ──
  const fore = longSleeve ? top : skin;
  for (const s of [1, -1] as const) {
    const L = s === 1;
    const x = s * d.sw;
    P.add(capsule(0.052, 0.17), L ? 'upperArmL' : 'upperArmR', top, [x, 1.29, 0]);
    P.add(capsule(0.045, 0.17), L ? 'foreArmL' : 'foreArmR', fore, [x, 1.03, 0]);
    if (longSleeve) P.add(cyl(0.05, 0.05, 0.03), L ? 'foreArmL' : 'foreArmR', cfg.top === 'blazer' ? '#f5f5f2' : shade(top, 0.85), [x, 0.935, 0]);
    P.add(sphere(0.047, 10, 8), L ? 'handL' : 'handR', skin, [x, 0.875, 0.005], [0, 0, 0], [0.8, 1.15, 0.65]);
  }

  // ── Legs ──
  for (const s of [1, -1] as const) {
    const L = s === 1;
    const x = s * d.hw;
    const thigh = cfg.bottom === 'skirt' ? skin : bottom;
    const shin = cfg.bottom === 'pants' ? bottom : skin;
    P.add(capsule(0.072, 0.27), L ? 'upperLegL' : 'upperLegR', thigh, [x, 0.68, 0]);
    if (cfg.bottom === 'shorts') P.add(cyl(0.082, 0.08, 0.06), L ? 'upperLegL' : 'upperLegR', shade(bottom, 0.9), [x, 0.52, 0]);
    P.add(capsule(0.056, 0.29), L ? 'lowerLegL' : 'lowerLegR', shin, [x, 0.27, 0]);
    const shoeH = cfg.shoes === 'boots' ? 0.16 : 0.08;
    P.add(rbox(0.1, shoeH, 0.24, 0.035), L ? 'footL' : 'footR', cfg.shoesColor, [x, shoeH / 2 + 0.005, 0.035]);
    if (cfg.shoes === 'sneakers') P.add(box(0.102, 0.022, 0.242), L ? 'footL' : 'footR', '#f2f2f2', [x, 0.012, 0.035]);
    if (cfg.shoes === 'formal') P.add(box(0.102, 0.012, 0.242), L ? 'footL' : 'footR', '#2a1d16', [x, 0.006, 0.035]);
  }
  if (cfg.bottom === 'skirt') P.add(cyl(0.19, 0.27, 0.36, 18), 'hips', bottom, [0, 0.8, 0]);

  // ── Head ──
  P.add(cyl(0.05, 0.055, 0.12), 'neck', skin, [0, 1.51, 0]);
  P.add(sphere(0.115, 18, 14), 'head', skin, headC, [0, 0, 0], [0.95, 1.08, 1.0]);
  P.add(sphere(0.026, 8, 6), 'head', skin, [0.11, 1.635, -0.005], [0, 0, 0], [0.55, 1, 0.9]);
  P.add(sphere(0.026, 8, 6), 'head', skin, [-0.11, 1.635, -0.005], [0, 0, 0], [0.55, 1, 0.9]);
  P.add(sphere(0.017, 8, 6), 'head', shade(skin, 0.94), [0, 1.625, 0.11]);

  // Face variants
  const f = cfg.face;
  const eyeScaleY = f === 'calm' ? 0.55 : f === 'serious' ? 0.75 : f === 'bright' ? 1.25 : 1;
  const browTilt = f === 'serious' ? 0.25 : f === 'cheerful' ? -0.12 : f === 'calm' ? 0.05 : -0.05;
  for (const s of [1, -1] as const) {
    P.add(sphere(0.02, 10, 8), 'head', '#fbfbfb', [s * 0.042, 1.66, 0.1], [0, 0, 0], [1.15, eyeScaleY, 0.55]);
    P.add(sphere(0.012, 8, 6), 'head', '#1d1a19', [s * 0.042, 1.659, 0.108], [0, 0, 0], [1, eyeScaleY * 1.1, 0.6]);
    P.add(box(0.042, 0.009, 0.012), 'head', shade(hair, 0.9), [s * 0.043, 1.697, 0.1], [0, 0, s * browTilt]);
    if (f === 'bright' || f === 'cheerful') P.add(sphere(0.018, 8, 6), 'head', mix(skin, '#ff8a8a', 0.45), [s * 0.068, 1.615, 0.087], [0, 0, 0], [1, 0.6, 0.4]);
  }
  if (f === 'friendly' || f === 'cheerful' || f === 'bright') {
    P.add(torus(0.022, 0.0055, 4, 10, Math.PI), 'head', '#9b4a44', [0, 1.597, 0.1], [0, 0, Math.PI]);
  } else {
    P.add(box(f === 'serious' ? 0.032 : 0.042, 0.008, 0.01), 'head', '#9b4a44', [0, 1.585, 0.103]);
  }

  // Beard
  if (cfg.beard !== 'none') {
    const bc = cfg.beard === 'stubble' ? mix(skin, hair, 0.45) : hair;
    const thick = cfg.beard === 'full' ? 1.07 : 1.015;
    P.add(sphere(0.116, 16, 10, 0, Math.PI * 2, 1.9, 1.0), 'head', bc, [0, 1.645, 0.006], [0, 0, 0], [0.96 * thick, 1.08 * thick, 1.0 * thick]);
    if (cfg.beard === 'full') P.add(box(0.05, 0.012, 0.012), 'head', bc, [0, 1.6, 0.108]);
  }

  // Hair
  const capR = cfg.hair === 'buzz' || cfg.hair === 'mohawk' ? 0.118 : 0.124;
  const capRot: V3 = [-0.45, 0, 0];
  const cap = (thLen = 1.45, r = capR) => P.add(sphere(r, 18, 10, 0, Math.PI * 2, 0, thLen), 'head', hair, [0, 1.648, -0.004], capRot, [0.98, 1.08, 1.04]);
  switch (cfg.hair) {
    case 'short':
      cap();
      break;
    case 'buzz':
      cap(1.4);
      break;
    case 'side':
      cap();
      P.add(rbox(0.16, 0.035, 0.07, 0.015), 'head', hair, [0.02, 1.74, 0.075], [0.25, 0, -0.28]);
      break;
    case 'long':
      cap(1.55);
      P.add(rbox(0.24, 0.34, 0.07, 0.03), 'head', hair, [0, 1.52, -0.1]);
      P.add(rbox(0.045, 0.24, 0.09, 0.02), 'head', hair, [0.115, 1.56, -0.01]);
      P.add(rbox(0.045, 0.24, 0.09, 0.02), 'head', hair, [-0.115, 1.56, -0.01]);
      break;
    case 'bob':
      cap(1.55);
      P.add(cyl(0.128, 0.138, 0.15, 18, true, Math.PI * 0.72, Math.PI * 1.56), 'head', hair, [0, 1.6, -0.005]);
      break;
    case 'bun':
      cap(1.5);
      P.add(sphere(0.058, 12, 10), 'head', hair, [0, 1.765, -0.075]);
      break;
    case 'ponytail':
      cap(1.5);
      P.add(sphere(0.03, 8, 6), 'head', shade(hair, 0.7), [0, 1.68, -0.13]);
      P.add(capsule(0.036, 0.17), 'head', hair, [0, 1.56, -0.15], [0.35, 0, 0]);
      break;
    case 'curly': {
      cap(1.45);
      const pts: V3[] = [[0, 1.77, 0], [0.07, 1.755, 0.03], [-0.07, 1.755, 0.03], [0.06, 1.75, -0.06], [-0.06, 1.75, -0.06], [0, 1.745, 0.075], [0.1, 1.7, -0.03], [-0.1, 1.7, -0.03], [0, 1.72, -0.1], [0.05, 1.735, 0.07], [-0.05, 1.735, 0.07]];
      for (const p of pts) P.add(sphere(0.045, 8, 6), 'head', hair, p);
      break;
    }
    case 'mohawk':
      cap(1.4);
      P.add(rbox(0.035, 0.08, 0.22, 0.015), 'head', hair, [0, 1.77, -0.01], [-0.15, 0, 0]);
      break;
    case 'bald':
      break;
  }

  // Headwear
  const hw = cfg.headwearColor;
  if (cfg.headwear === 'cap') {
    P.add(sphere(0.128, 18, 10, 0, Math.PI * 2, 0, 1.35), 'head', hw, [0, 1.655, -0.005], [-0.25, 0, 0], [1, 1.02, 1.04]);
    P.add(rbox(0.17, 0.014, 0.11, 0.006), 'head', shade(hw, 0.85), [0, 1.72, 0.135], [0.12, 0, 0]);
    P.add(box(0.035, 0.022, 0.006), 'head', '#f7941d', [0, 1.765, 0.12], [-0.6, 0, 0]);
  } else if (cfg.headwear === 'beanie') {
    P.add(sphere(0.131, 18, 10, 0, Math.PI * 2, 0, 1.5), 'head', hw, [0, 1.66, -0.005], [-0.2, 0, 0], [1, 1.12, 1.04]);
    P.add(torus(0.123, 0.016, 6, 22), 'head', shade(hw, 0.8), [0, 1.7, 0.0], [Math.PI / 2 - 0.2, 0, 0]);
  } else if (cfg.headwear === 'headphones') {
    P.add(torus(0.132, 0.011, 6, 20, Math.PI), 'head', '#22252b', [0, 1.65, 0]);
    for (const s of [1, -1]) P.add(cyl(0.042, 0.042, 0.035, 14), 'head', hw, [s * 0.128, 1.64, 0], [0, 0, Math.PI / 2]);
  }

  // Glasses
  if (cfg.glasses !== 'none') {
    const frame = '#1b1b1f';
    const seg = cfg.glasses === 'round' ? 14 : 4;
    const rot = cfg.glasses === 'round' ? 0 : Math.PI / 4;
    for (const s of [1, -1]) P.add(torus(cfg.glasses === 'round' ? 0.026 : 0.031, 0.0045, 4, seg), 'head', frame, [s * 0.043, 1.66, 0.118], [0, 0, rot]);
    P.add(box(0.026, 0.005, 0.005), 'head', frame, [0, 1.665, 0.12]);
    for (const s of [1, -1]) P.add(box(0.005, 0.005, 0.11), 'head', frame, [s * 0.072, 1.664, 0.065]);
  }
  if (cfg.earrings) for (const s of [1, -1]) P.add(sphere(0.009, 6, 5), 'head', '#e8c25a', [s * 0.112, 1.6, 0.005]);
  return P;
}

// ───────────────────────────── public API ─────────────────────────────
export const avatarMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.02 });

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
  // Generous fixed bounds (poses never leave this sphere) → cheap & correct frustum culling.
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.25);
  mesh.frustumCulled = true;
  const root = new THREE.Group();
  root.add(mesh);
  root.scale.setScalar(cfg.height);
  return {
    root,
    mesh,
    bones,
    height: 1.72 * cfg.height,
    dispose: () => {
      skeleton.dispose();
      releaseGeometry(cfg);
    },
  };
}
