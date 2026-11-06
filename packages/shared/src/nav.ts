/** Waypoint-graph pathfinding used by the "navigate to room" guidance. */
import { NAV_EDGES, NAV_NODES, ROOM_NAV_TARGET, type NavNode, type ZoneId } from './layout';
import { dist, type Vec2 } from './geometry';

const nodeById = new Map<string, NavNode>(NAV_NODES.map((n) => [n.id, n]));
const adjacency = new Map<string, Array<{ id: string; w: number }>>();
for (const [a, b] of NAV_EDGES) {
  const na = nodeById.get(a)!;
  const nb = nodeById.get(b)!;
  const w = dist(na.x, na.z, nb.x, nb.z);
  if (!adjacency.has(a)) adjacency.set(a, []);
  if (!adjacency.has(b)) adjacency.set(b, []);
  adjacency.get(a)!.push({ id: b, w });
  adjacency.get(b)!.push({ id: a, w });
}

export function nearestNavNode(x: number, z: number): NavNode {
  let best = NAV_NODES[0];
  let bd = Infinity;
  for (const n of NAV_NODES) {
    const d = dist(x, z, n.x, n.z);
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return best;
}

/** Dijkstra between two graph nodes; returns node ids. */
export function shortestPath(fromId: string, toId: string): string[] {
  const d = new Map<string, number>();
  const prev = new Map<string, string>();
  const open = new Set<string>(NAV_NODES.map((n) => n.id));
  for (const id of open) d.set(id, Infinity);
  d.set(fromId, 0);
  while (open.size) {
    let u: string | null = null;
    let ud = Infinity;
    for (const id of open) {
      const v = d.get(id)!;
      if (v < ud) {
        ud = v;
        u = id;
      }
    }
    if (u === null || ud === Infinity) break;
    open.delete(u);
    if (u === toId) break;
    for (const { id, w } of adjacency.get(u) ?? []) {
      if (!open.has(id)) continue;
      const nd = ud + w;
      if (nd < d.get(id)!) {
        d.set(id, nd);
        prev.set(id, u);
      }
    }
  }
  if (fromId !== toId && !prev.has(toId)) return [fromId];
  const path = [toId];
  let cur = toId;
  while (cur !== fromId) {
    cur = prev.get(cur)!;
    path.unshift(cur);
  }
  return path;
}

/** Path (world XZ points) from a position to a room or explicit point. */
export function planRoute(from: Vec2, target: { zone?: ZoneId; point?: Vec2 }): Vec2[] {
  const start = nearestNavNode(from.x, from.z);
  let goalId: string | undefined;
  let finalPoint: Vec2 | undefined;
  if (target.zone) goalId = ROOM_NAV_TARGET[target.zone];
  if (target.point) {
    goalId = nearestNavNode(target.point.x, target.point.z).id;
    finalPoint = target.point;
  }
  if (!goalId) return [];
  const ids = shortestPath(start.id, goalId);
  const pts: Vec2[] = [{ x: from.x, z: from.z }, ...ids.map((id) => ({ x: nodeById.get(id)!.x, z: nodeById.get(id)!.z }))];
  if (finalPoint) pts.push(finalPoint);
  // Drop the first graph node if we're already past it (prevents walking back).
  if (pts.length > 2) {
    const [p0, p1, p2] = pts;
    if (dist(p0.x, p0.z, p2.x, p2.z) < dist(p1.x, p1.z, p2.x, p2.z)) pts.splice(1, 1);
  }
  return pts;
}

export const getNavNode = (id: string) => nodeById.get(id);
