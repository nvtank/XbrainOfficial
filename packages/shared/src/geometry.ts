/** Lightweight 2D (XZ-plane) geometry helpers shared by client & server. */

export interface Vec2 {
  x: number;
  z: number;
}

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const rect = (minX: number, maxX: number, minZ: number, maxZ: number): Rect => ({ minX, maxX, minZ, maxZ });

export function rectFromCenter(cx: number, cz: number, w: number, d: number, rotY = 0): Rect {
  // Only axis-aligned rotations (multiples of 90°) are supported for colliders.
  const quarter = Math.round(rotY / (Math.PI / 2));
  const swap = Math.abs(quarter) % 2 === 1;
  const hw = (swap ? d : w) / 2;
  const hd = (swap ? w : d) / 2;
  return { minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd };
}

export const rectCenter = (r: Rect): Vec2 => ({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 });
export const rectSize = (r: Rect) => ({ w: r.maxX - r.minX, d: r.maxZ - r.minZ });

export function inRect(r: Rect, x: number, z: number, pad = 0): boolean {
  return x >= r.minX - pad && x <= r.maxX + pad && z >= r.minZ - pad && z <= r.maxZ + pad;
}

export function expandRect(r: Rect, by: number): Rect {
  return { minX: r.minX - by, maxX: r.maxX + by, minZ: r.minZ - by, maxZ: r.maxZ + by };
}

export const dist2 = (ax: number, az: number, bx: number, bz: number) => {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
};

export const dist = (ax: number, az: number, bx: number, bz: number) => Math.sqrt(dist2(ax, az, bx, bz));

/** Segment (a→b) vs axis-aligned rectangle intersection (slab method). */
export function segmentIntersectsRect(ax: number, az: number, bx: number, bz: number, r: Rect): boolean {
  let tmin = 0;
  let tmax = 1;
  const dx = bx - ax;
  const dz = bz - az;
  const axes: Array<[number, number, number, number]> = [
    [ax, dx, r.minX, r.maxX],
    [az, dz, r.minZ, r.maxZ],
  ];
  for (const [p, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return false;
    } else {
      let t1 = (lo - p) / d;
      let t2 = (hi - p) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return true;
}

/** Shortest signed angle difference (radians) from a to b. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
