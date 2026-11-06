/**
 * Non-reactive per-frame runtime state shared between the network layer, the
 * render loop and audio. Kept outside React to avoid re-renders at 60 Hz.
 */
import * as THREE from 'three';
import { AnimCode, INTERP_DELAY_MS, type EmoteName } from '@xbrain/shared';
import { serverNow } from '../services/clock';

export interface TransformSample {
  t: number;
  x: number;
  y: number;
  z: number;
  r: number;
  a: number;
}

export class InterpBuffer {
  samples: TransformSample[] = [];

  push(s: TransformSample) {
    const last = this.samples[this.samples.length - 1];
    if (last && s.t <= last.t) {
      if (s.t === last.t) this.samples[this.samples.length - 1] = s;
      return;
    }
    this.samples.push(s);
    if (this.samples.length > 30) this.samples.shift();
  }

  /** Interpolated transform at render time (server clock - delay). */
  sample(out: { x: number; y: number; z: number; r: number; a: number; speed: number }) {
    const n = this.samples.length;
    if (!n) return false;
    const rt = serverNow() - INTERP_DELAY_MS;
    let i = n - 1;
    while (i > 0 && this.samples[i - 1].t > rt) i--;
    const b = this.samples[i];
    const a = i > 0 ? this.samples[i - 1] : b;
    if (rt >= b.t || a === b) {
      // Past the newest sample → short extrapolation, then hold.
      const prev = n > 1 ? this.samples[n - 2] : b;
      const dt = Math.min(Math.max(rt - b.t, 0), 200);
      const span = Math.max(1, b.t - prev.t);
      const moving = b.a === AnimCode.Walk || b.a === AnimCode.Run;
      const k = moving && span < 600 ? dt / span : 0;
      out.x = b.x + (b.x - prev.x) * k;
      out.y = b.y;
      out.z = b.z + (b.z - prev.z) * k;
      out.r = b.r;
      out.a = b.a;
      out.speed = moving && span < 600 ? Math.hypot(b.x - prev.x, b.z - prev.z) / (span / 1000) : 0;
      return true;
    }
    const t = (rt - a.t) / Math.max(1, b.t - a.t);
    out.x = a.x + (b.x - a.x) * t;
    out.y = a.y + (b.y - a.y) * t;
    out.z = a.z + (b.z - a.z) * t;
    let dr = b.r - a.r;
    if (dr > Math.PI) dr -= Math.PI * 2;
    if (dr < -Math.PI) dr += Math.PI * 2;
    out.r = a.r + dr * t;
    out.a = t < 0.5 ? a.a : b.a;
    out.speed = Math.hypot(b.x - a.x, b.z - a.z) / (Math.max(1, b.t - a.t) / 1000);
    return true;
  }
}

export const runtime = {
  /** Local player authoritative-for-rendering position. */
  local: {
    pos: new THREE.Vector3(0, 0, 11),
    rotY: Math.PI,
    anim: AnimCode.Idle as number,
    speed: 0,
    grounded: true,
    /** Set by the network on correction/teleport; consumed by the controller. */
    teleport: null as null | { x: number; y: number; z: number; rotY?: number },
    emote: null as null | { name: EmoteName; until: number },
    talkingUntil: 0,
  },
  /** Remote transform buffers keyed by player idx. */
  buffers: new Map<number, InterpBuffer>(),
  /** Latest interpolated remote positions keyed by sessionId (audio, minimap, interaction). */
  remotePos: new Map<string, THREE.Vector3>(),
  /** Remote emotes keyed by sessionId. */
  remoteEmotes: new Map<string, { name: EmoteName; until: number }>(),
  /** Rapier collider handles of remote avatars (for the "collide with others" filter). */
  remoteColliders: new Set<number>(),
  /** Camera yaw used for movement, and the current camera object. */
  camYaw: Math.PI,
  camera: null as THREE.Camera | null,
  /** Listener orientation for spatial audio. */
  listenerPos: new THREE.Vector3(),
  listenerForward: new THREE.Vector3(0, 0, -1),
  stats: { fps: 0, frameMs: 0, drawCalls: 0, triangles: 0 },
  /** Local player's Rapier rigid body (camera ray exclusion). */
  localBody: null as unknown,
  /** Avatar height of the local player (m). */
  localHeight: 1.72,
  /** 0..1 opening of the automatic entrance door. */
  entranceOpen: 0,
};

export function getBuffer(idx: number) {
  let b = runtime.buffers.get(idx);
  if (!b) {
    b = new InterpBuffer();
    runtime.buffers.set(idx, b);
  }
  return b;
}
