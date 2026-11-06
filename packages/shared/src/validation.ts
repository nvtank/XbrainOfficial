/** Authoritative movement validation helpers (used by the server; also handy for client debugging). */
import { RUN_SPEED, SPEED_TOLERANCE } from './constants';
import { expandRect, inRect, segmentIntersectsRect, type Rect } from './geometry';
import { OBSTACLES, isWalkable } from './layout';

const WALL_RECTS: Rect[] = OBSTACLES.filter((o) => o.kind === 'wall').map((o) => expandRect(o.rect, -0.02));
const SOLID_RECTS: Rect[] = OBSTACLES.map((o) => expandRect(o.rect, -0.06));

export function pointBlocked(x: number, z: number): boolean {
  for (const r of SOLID_RECTS) if (inRect(r, x, z)) return true;
  return false;
}

export function crossesWall(ax: number, az: number, bx: number, bz: number): boolean {
  for (const r of WALL_RECTS) if (segmentIntersectsRect(ax, az, bx, bz, r)) return true;
  return false;
}

export interface MoveCheck {
  ok: boolean;
  reason?: 'nan' | 'bounds' | 'speed' | 'blocked' | 'wall' | 'height';
}

export function validateMove(
  prev: { x: number; z: number },
  next: { x: number; y: number; z: number },
  dtMs: number,
): MoveCheck {
  if (![next.x, next.y, next.z].every(Number.isFinite)) return { ok: false, reason: 'nan' };
  if (next.y < -0.5 || next.y > 2.0) return { ok: false, reason: 'height' };
  if (!isWalkable(next.x, next.z)) return { ok: false, reason: 'bounds' };
  const dt = Math.min(Math.max(dtMs, 16), 1000) / 1000;
  const d = Math.hypot(next.x - prev.x, next.z - prev.z);
  if (d > RUN_SPEED * SPEED_TOLERANCE * dt + 0.35) return { ok: false, reason: 'speed' };
  if (pointBlocked(next.x, next.z)) return { ok: false, reason: 'blocked' };
  if (d > 0.01 && crossesWall(prev.x, prev.z, next.x, next.z)) return { ok: false, reason: 'wall' };
  return { ok: true };
}
