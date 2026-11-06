/**
 * XBrain Đà Nẵng office layout — single source of truth for:
 *  - the 3D scene (client renders furniture/walls from this data)
 *  - physics colliders (client) and movement validation (server)
 *  - seats / desks / interactable objects / camera presets / navigation graph
 *
 * Coordinate system (meters, Y up). Viewed from the main entrance looking into the office:
 *   -Z = deeper into the office (north) — the far glass façade looks straight at the Thuận Phước bridge
 *   +X = right (east) — a solid wall with decorative accents
 *   -X = left  (west, functional rooms column)
 *   +Z = toward the entrance / outside corridor (south)
 * Rotation `rotY` follows Three.js: an object with rotY = 0 faces +Z; facing vector = (sin rotY, cos rotY).
 */
import { rect, rectFromCenter, type Rect, type Vec2, inRect } from './geometry';

export const CEILING_HEIGHT = 4.0;
export const FACADE_HEIGHT = 4.8;
const PI = Math.PI;
const HALF = PI / 2;

/** West edge of the office (functional rooms are 8 m deep: x ∈ [-15, -7]). */
const WX = -15;

// ───────────────────────────────── Zones ─────────────────────────────────
export type ZoneId =
  | 'outside'
  | 'lobby'
  | 'storage'
  | 'meeting'
  | 'kitchen'
  | 'director'
  | 'corridor'
  | 'workspace'
  | 'lounge';

export type FloorKind = 'stone' | 'tile' | 'carpet' | 'wood' | 'kitchenTile' | 'meetingCarpet' | 'marble';

export interface ZoneDef {
  id: ZoneId;
  name: string;
  nameVi: string;
  rect: Rect;
  /** Closed rooms attenuate voice to the outside. */
  enclosed: boolean;
  floor: FloorKind;
  mapColor: string;
  /** Show on mini-map / room navigation. */
  navigable: boolean;
}

export const ZONES: ZoneDef[] = [
  { id: 'outside', name: 'Building Corridor', nameVi: 'Hành lang tòa nhà', rect: rect(-16, 16, 7.15, 14), enclosed: false, floor: 'stone', mapColor: '#3b4250', navigable: true },
  { id: 'lobby', name: 'Reception', nameVi: 'Lễ tân', rect: rect(-7, 7, 0.15, 6.85), enclosed: false, floor: 'tile', mapColor: '#4a4f5a', navigable: true },
  { id: 'storage', name: 'Storage & Lockers', nameVi: 'Kệ · Tủ', rect: rect(WX, -7, -4.4, 0), enclosed: false, floor: 'tile', mapColor: '#6b6152', navigable: true },
  { id: 'meeting', name: 'Meeting Room', nameVi: 'Phòng họp', rect: rect(WX, -7.1, -11.9, -4.6), enclosed: true, floor: 'meetingCarpet', mapColor: '#3e6b4f', navigable: true },
  { id: 'kitchen', name: 'Open Pantry', nameVi: 'Bếp (khu mở)', rect: rect(WX, -7.1, -18.9, -12.1), enclosed: false, floor: 'kitchenTile', mapColor: '#8a5a2b', navigable: true },
  { id: 'director', name: 'Director Office', nameVi: 'Phòng giám đốc', rect: rect(WX, -7.1, -30, -19.1), enclosed: true, floor: 'marble', mapColor: '#3d5a80', navigable: true },
  { id: 'corridor', name: 'Left Corridor', nameVi: 'Lối trái', rect: rect(-7, -4.5, -30, 0.15), enclosed: false, floor: 'tile', mapColor: '#555b66', navigable: false },
  { id: 'workspace', name: 'Main Workspace', nameVi: 'Khu làm việc', rect: rect(-4.5, 12, -28, 0), enclosed: false, floor: 'carpet', mapColor: '#2f3c4f', navigable: true },
  { id: 'lounge', name: 'Bridge View Lounge', nameVi: 'Góc ngắm cầu', rect: rect(-4.5, 12, -30, -28), enclosed: false, floor: 'tile', mapColor: '#1f5f7a', navigable: true },
];

export const ZONE_BY_ID: Record<ZoneId, ZoneDef> = Object.fromEntries(ZONES.map((z) => [z.id, z])) as Record<ZoneId, ZoneDef>;

/** Zone priority for point lookup (rooms first so overlapping wall lines resolve into rooms). */
const ZONE_LOOKUP_ORDER: ZoneId[] = ['meeting', 'kitchen', 'director', 'storage', 'lobby', 'outside', 'corridor', 'lounge', 'workspace'];

export function zoneAt(x: number, z: number): ZoneId | null {
  for (const id of ZONE_LOOKUP_ORDER) if (inRect(ZONE_BY_ID[id].rect, x, z)) return id;
  return null;
}

/** Union of walkable areas (slightly padded so wall-line door crossings are allowed). */
export function isWalkable(x: number, z: number): boolean {
  for (const zn of ZONES) if (inRect(zn.rect, x, z, 0.35)) return true;
  return false;
}

// ───────────────────────────────── Walls ─────────────────────────────────
export type WallMaterial = 'white' | 'black' | 'glass' | 'frosted' | 'curtain' | 'facade' | 'corridor';

export interface WallOpening {
  /** Along-wall coordinates (z for X-walls, x for Z-walls). */
  from: number;
  to: number;
  height: number;
  doorId?: string;
}

export interface WallDef {
  id: string;
  /** 'x' → wall runs along the X axis at constant z; 'z' → runs along Z at constant x. */
  axis: 'x' | 'z';
  /** Constant coordinate of the wall centerline. */
  at: number;
  from: number;
  to: number;
  thickness: number;
  y0: number;
  height: number;
  material: WallMaterial;
  openings?: WallOpening[];
  /** Exterior wall (window to the city). */
  exterior?: boolean;
}

const T = 0.2;
const wx = (id: string, z: number, x1: number, x2: number, material: WallMaterial, extra: Partial<WallDef> = {}): WallDef => ({
  id, axis: 'x', at: z, from: x1, to: x2, thickness: T, y0: 0, height: CEILING_HEIGHT, material, ...extra,
});
const wz = (id: string, x: number, z1: number, z2: number, material: WallMaterial, extra: Partial<WallDef> = {}): WallDef => ({
  id, axis: 'z', at: x, from: z1, to: z2, thickness: T, y0: 0, height: CEILING_HEIGHT, material, ...extra,
});

export const DOOR_HEIGHT = 2.3;

export const WALLS: WallDef[] = [
  // Perimeter of the main office
  wz('w-west', WX - 0.1, -30.2, 0.2, 'white'),
  // The north façade is floor-to-ceiling glass: the Thuận Phước bridge is straight ahead.
  wx('w-north', -30.1, WX - 0.2, 12.2, 'curtain', { exterior: true }),
  // The right (east) side is a solid wall.
  wz('w-east', 12.1, -30.2, 0.2, 'white'),
  wx('w-south-l', 0.1, WX - 0.2, -7.2, 'white'),
  wx('w-south-r', 0.1, 7.2, 12.2, 'white'),
  // Lobby annex
  wz('w-lobby-w', -7.1, 0, 6.85, 'white'),
  wz('w-lobby-e', 7.1, 0, 6.85, 'white'),
  // Black logo wall behind reception (both sides are the left / right walkways)
  wx('w-logo', 0, -4.5, 4.5, 'black', { thickness: 0.3 }),
  // Façade toward the building corridor
  wx('w-facade-l', 7, -16, -4.5, 'facade', { thickness: 0.3, height: FACADE_HEIGHT }),
  wx('w-facade-gl', 7, -4.5, -1.55, 'glass', { thickness: 0.12, height: 2.7 }),
  wx('w-facade-gr', 7, 1.55, 4.5, 'glass', { thickness: 0.12, height: 2.7 }),
  wx('w-facade-head', 7, -4.5, 4.5, 'facade', { thickness: 0.3, y0: 2.7, height: FACADE_HEIGHT - 2.7 }),
  wx('w-facade-r', 7, 4.5, 16, 'facade', { thickness: 0.3, height: FACADE_HEIGHT }),
  // Building corridor
  wx('w-corr-s', 14.1, -16.2, 16.2, 'corridor', { height: FACADE_HEIGHT }),
  wz('w-corr-w', -16.1, 7, 14.2, 'corridor', { height: FACADE_HEIGHT }),
  wz('w-corr-e', 16.1, 7, 14.2, 'corridor', { height: FACADE_HEIGHT }),
  // Functional rooms (left column)
  wx('w-storage-meeting', -4.5, WX - 0.2, -7, 'white'),
  // Private rooms: solid walls + doors (closed rooms block sight, voice and nearby chat)
  wz('w-meeting-e', -7.05, -12, -4.4, 'white', {
    openings: [{ from: -6.25, to: -5.15, height: DOOR_HEIGHT, doorId: 'door-meeting' }],
  }),
  wx('w-meeting-kitchen', -12, WX - 0.2, -7, 'white'),
  // Open pantry: wide opening to the corridor, only short wall ends and a header beam
  wz('w-kitchen-e', -7.05, -19, -12, 'white', {
    openings: [{ from: -18.4, to: -12.6, height: 2.7 }],
  }),
  wx('w-kitchen-director', -19, WX - 0.2, -7, 'white'),
  wz('w-director-e', -7.05, -30, -19, 'white', {
    openings: [{ from: -21.35, to: -20.15, height: DOOR_HEIGHT, doorId: 'door-director' }],
  }),
];

export interface WallPiece {
  wallId: string;
  material: WallMaterial;
  rect: Rect;
  y0: number;
  y1: number;
  exterior: boolean;
}

/** Split walls around openings into solid boxes (+ headers above doors). */
export function wallPieces(wall: WallDef): WallPiece[] {
  const pieces: WallPiece[] = [];
  const top = wall.y0 + wall.height;
  const mk = (a: number, b: number, y0: number, y1: number) => {
    if (b - a < 1e-3 || y1 - y0 < 1e-3) return;
    const h = wall.thickness / 2;
    const r = wall.axis === 'x' ? rect(a, b, wall.at - h, wall.at + h) : rect(wall.at - h, wall.at + h, a, b);
    pieces.push({ wallId: wall.id, material: wall.material, rect: r, y0, y1, exterior: !!wall.exterior });
  };
  const ops = [...(wall.openings ?? [])].sort((a, b) => a.from - b.from);
  let cursor = wall.from;
  for (const op of ops) {
    mk(cursor, op.from, wall.y0, top);
    mk(op.from, op.to, op.height, top);
    cursor = op.to;
  }
  mk(cursor, wall.to, wall.y0, top);
  return pieces;
}

export const WALL_PIECES: WallPiece[] = WALLS.flatMap(wallPieces);

// ───────────────────────────────── Doors ─────────────────────────────────
export interface DoorDef {
  id: string;
  label: string;
  /** Hinge position (XZ). */
  hinge: Vec2;
  /** Wall axis the door sits in. */
  axis: 'x' | 'z';
  width: number;
  /** Closed leaf direction from hinge along the wall axis: +1 or -1. */
  dir: 1 | -1;
  /** Opening swing (radians, sign gives side). */
  swing: number;
  style: 'glass' | 'wood';
  zones: [ZoneId, ZoneId];
}

export const DOORS: DoorDef[] = [
  { id: 'door-meeting', label: 'Meeting Room Door', hinge: { x: -7.05, z: -5.15 }, axis: 'z', width: 1.1, dir: -1, swing: HALF * 0.95, style: 'wood', zones: ['meeting', 'corridor'] },
  { id: 'door-director', label: 'Director Office Door', hinge: { x: -7.05, z: -20.15 }, axis: 'z', width: 1.2, dir: -1, swing: HALF * 0.95, style: 'wood', zones: ['director', 'corridor'] },
];

/** Automatic sliding entrance door (opens locally when any avatar is near; no server state). */
export const ENTRANCE_DOOR = { x: 0, z: 7, width: 3.1, height: 2.7, triggerRadius: 3.0 };

/** Collider rect of a closed door leaf. */
export function doorClosedRect(d: DoorDef): Rect {
  const a = d.axis === 'z' ? d.hinge.z : d.hinge.x;
  const b = a + d.dir * d.width;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return d.axis === 'z' ? rect(d.hinge.x - 0.05, d.hinge.x + 0.05, lo, hi) : rect(lo, hi, d.hinge.z - 0.05, d.hinge.z + 0.05);
}

/** Collider rect of an opened door leaf (swung ~90° into the room, the -X side for these doors). */
export function doorOpenRect(d: DoorDef): Rect {
  return d.axis === 'z' ? rect(d.hinge.x - d.width, d.hinge.x - 0.02, d.hinge.z - 0.06, d.hinge.z + 0.06) : rect(d.hinge.x - 0.06, d.hinge.x + 0.06, d.hinge.z - d.width, d.hinge.z);
}

export function doorCenter(d: DoorDef): Vec2 {
  return d.axis === 'z'
    ? { x: d.hinge.x, z: d.hinge.z + (d.dir * d.width) / 2 }
    : { x: d.hinge.x + (d.dir * d.width) / 2, z: d.hinge.z };
}

// ───────────────────────────────── Desks & seats ─────────────────────────────────
export type SeatKind = 'desk' | 'reception' | 'meeting' | 'kitchen' | 'director' | 'guest' | 'sofa' | 'lounge' | 'bench';
export type ChairStyle = 'office' | 'executive' | 'wood' | 'stool' | 'none';

export interface SeatDef {
  id: string;
  kind: SeatKind;
  label: string;
  x: number;
  z: number;
  /** Direction the seated avatar faces. */
  rotY: number;
  /** Seat surface height. */
  seatHeight: number;
  /** Safe stand-up point. */
  stand: Vec2;
  zone: ZoneId;
  chair: ChairStyle;
  deskId?: string;
  /** Seated player can open the computer UI. */
  hasComputer?: boolean;
}

export interface DeskDef {
  id: string;
  cluster: number;
  index: number;
  row: 'A' | 'B';
  x: number;
  z: number;
  /** Facing direction of the occupant (toward the monitor). */
  rotY: number;
  seatId: string;
}

export const DESK_WIDTH = 1.6;
export const DESK_DEPTH = 0.75;
export const DESK_HEIGHT = 0.74;
export const CLUSTER_CENTER_X = 3.5;
export const CLUSTER_Z = [-5, -10, -15, -20, -25];
export const CLUSTER_COUNT = 5;
export const DESKS_PER_ROW = 5;

const facingVec = (rotY: number) => ({ x: Math.sin(rotY), z: Math.cos(rotY) });

function seat(
  id: string,
  kind: SeatKind,
  label: string,
  x: number,
  z: number,
  rotY: number,
  zone: ZoneId,
  chair: ChairStyle,
  opts: { seatHeight?: number; standFront?: boolean; standDist?: number; deskId?: string; hasComputer?: boolean } = {},
): SeatDef {
  const f = facingVec(rotY);
  const d = opts.standDist ?? 0.74;
  const s = opts.standFront ? 1 : -1;
  return {
    id, kind, label, x, z, rotY, zone, chair,
    seatHeight: opts.seatHeight ?? 0.47,
    stand: { x: +(x + f.x * d * s).toFixed(3), z: +(z + f.z * d * s).toFixed(3) },
    deskId: opts.deskId,
    hasComputer: opts.hasComputer,
  };
}

export const DESKS: DeskDef[] = [];
export const SEATS: SeatDef[] = [];

for (let c = 0; c < CLUSTER_COUNT; c++) {
  const cz = CLUSTER_Z[c];
  for (let r = 0; r < 2; r++) {
    for (let j = 0; j < DESKS_PER_ROW; j++) {
      const index = r * DESKS_PER_ROW + j + 1;
      const id = `D${c + 1}-${String(index).padStart(2, '0')}`;
      const x = CLUSTER_CENTER_X - (DESKS_PER_ROW * DESK_WIDTH) / 2 + DESK_WIDTH / 2 + j * DESK_WIDTH;
      // Row A: south side (closer to reception), occupant faces north (rotY = π)
      const rowA = r === 0;
      const deskZ = rowA ? cz + DESK_DEPTH / 2 : cz - DESK_DEPTH / 2;
      const rotY = rowA ? PI : 0;
      const seatZ = rowA ? cz + DESK_DEPTH + 0.45 : cz - DESK_DEPTH - 0.45;
      const seatId = `S-${id}`;
      DESKS.push({ id, cluster: c + 1, index, row: rowA ? 'A' : 'B', x: +x.toFixed(3), z: deskZ, rotY, seatId });
      SEATS.push(seat(seatId, 'desk', `Desk ${c + 1}-${String(index).padStart(2, '0')}`, +x.toFixed(3), seatZ, rotY, 'workspace', 'office', { deskId: id, hasComputer: true }));
    }
  }
}

const MX = -11; // center x of the left-column rooms

SEATS.push(
  // Reception (behind the desk, facing the entrance)
  seat('S-R-1', 'reception', 'Reception Seat 1', -0.8, 1.55, 0, 'lobby', 'office', { hasComputer: true }),
  seat('S-R-2', 'reception', 'Reception Seat 2', 0.8, 1.55, 0, 'lobby', 'office', { hasComputer: true }),
  // Lobby waiting sofa
  seat('S-L-1', 'sofa', 'Lobby Sofa', -6.35, 4.25, HALF, 'lobby', 'none', { standFront: true, standDist: 0.75, seatHeight: 0.44 }),
  seat('S-L-2', 'sofa', 'Lobby Sofa', -6.35, 4.95, HALF, 'lobby', 'none', { standFront: true, standDist: 0.75, seatHeight: 0.44 }),
  // Meeting room (10 seats around the table)
  ...[-1.5, -0.5, 0.5, 1.5].map((dz, i) => seat(`S-M-${i + 1}`, 'meeting', `Meeting Seat ${i + 1}`, MX - 1.15, -8.3 + dz, HALF, 'meeting', 'office')),
  ...[-1.5, -0.5, 0.5, 1.5].map((dz, i) => seat(`S-M-${i + 5}`, 'meeting', `Meeting Seat ${i + 5}`, MX + 1.15, -8.3 + dz, -HALF, 'meeting', 'office')),
  seat('S-M-9', 'meeting', 'Meeting Seat 9 (Head)', MX, -10.85, 0, 'meeting', 'office', { standDist: 0.62 }),
  seat('S-M-10', 'meeting', 'Meeting Seat 10', MX, -5.75, PI, 'meeting', 'office', { standDist: 0.62 }),
  // Kitchen: two round tables × 4 chairs
  ...[-14.7, -17.4].flatMap((tz, t) => [
    seat(`S-K-${t * 4 + 1}`, 'kitchen', 'Pantry Chair', -11.3, tz, HALF, 'kitchen', 'wood', { standDist: 0.66 }),
    seat(`S-K-${t * 4 + 2}`, 'kitchen', 'Pantry Chair', -9.9, tz, -HALF, 'kitchen', 'wood', { standDist: 0.66 }),
    seat(`S-K-${t * 4 + 3}`, 'kitchen', 'Pantry Chair', -10.6, tz - 0.7, 0, 'kitchen', 'wood', { standDist: 0.66 }),
    seat(`S-K-${t * 4 + 4}`, 'kitchen', 'Pantry Chair', -10.6, tz + 0.7, PI, 'kitchen', 'wood', { standDist: 0.66 }),
  ]),
  // Director office
  seat('S-DIR', 'director', 'Director Chair', MX, -28.3, 0, 'director', 'executive', { hasComputer: true, standDist: 0.62 }),
  seat('S-G-1', 'guest', 'Guest Chair', MX - 0.65, -26.0, PI, 'director', 'executive'),
  seat('S-G-2', 'guest', 'Guest Chair', MX + 0.65, -26.0, PI, 'director', 'executive'),
  ...[-22.15, -21.4, -20.65].map((z, i) => seat(`S-SF-${i + 1}`, 'sofa', 'Director Lounge Sofa', -14.35, z, HALF, 'director', 'none', { standFront: true, standDist: 0.75, seatHeight: 0.44 })),
  seat('S-AC-1', 'sofa', 'Leather Armchair', -11.75, -20.7, -HALF, 'director', 'none', { standDist: 0.78, seatHeight: 0.44 }),
  seat('S-AC-2', 'sofa', 'Leather Armchair', -11.75, -22.1, -HALF, 'director', 'none', { standDist: 0.78, seatHeight: 0.44 }),
  // Bridge view lounge stools (face the north glass, straight at the bridge)
  ...[-2.6, -0.4, 1.8, 5.2, 7.4, 9.6].map((x, i) => seat(`S-LG-${i + 1}`, 'lounge', 'Bridge View Stool', x, -28.95, PI, 'lounge', 'stool', { seatHeight: 0.74, standDist: 0.7 })),
  // Building corridor benches
  ...[-9.45, -8.55, 8.55, 9.45].map((x, i) => seat(`S-B-${i + 1}`, 'bench', 'Corridor Bench', x, 13.55, PI, 'outside', 'none', { standFront: true, standDist: 0.75, seatHeight: 0.45 })),
);

export const SEAT_BY_ID: Record<string, SeatDef> = Object.fromEntries(SEATS.map((s) => [s.id, s]));
export const DESK_BY_ID: Record<string, DeskDef> = Object.fromEntries(DESKS.map((d) => [d.id, d]));
export const DESK_SEAT_IDS = SEATS.filter((s) => s.kind === 'desk').map((s) => s.id);
export const TOTAL_DESKS = DESKS.length; // 50

// ───────────────────────────────── Furniture ─────────────────────────────────
export type FurnitureType =
  | 'deskCluster'
  | 'receptionDesk'
  | 'logoSign'
  | 'meetingTable'
  | 'tv'
  | 'whiteboard'
  | 'plant'
  | 'tallPlant'
  | 'shelf'
  | 'lockerBank'
  | 'fileCabinet'
  | 'tallCabinet'
  | 'printer'
  | 'kitchenCounter'
  | 'upperCabinets'
  | 'fridge'
  | 'coffeeMachine'
  | 'waterDispenser'
  | 'cupShelf'
  | 'snackShelf'
  | 'microwave'
  | 'roundTable'
  | 'directorDesk'
  | 'credenza'
  | 'displayShelf'
  | 'chandelier'
  | 'woodSlats'
  | 'sofa'
  | 'armchair'
  | 'coffeeTable'
  | 'bookshelf'
  | 'barCounter'
  | 'column'
  | 'wallFan'
  | 'bench'
  | 'elevator'
  | 'floorLamp'
  | 'rug'
  | 'statusScreen'
  | 'welcomeScreen'
  | 'attendanceScreen'
  | 'leaderboard'
  | 'kiosk'
  | 'cctv'
  | 'poster'
  | 'sign'
  | 'pendant';

export interface FurnitureDef {
  id: string;
  type: FurnitureType;
  x: number;
  y?: number;
  z: number;
  rotY: number;
  /** Width along local X, depth along local Z (front), height. */
  w: number;
  d: number;
  h: number;
  zone: ZoneId;
  collider?: boolean;
  variant?: string;
}

const f = (
  id: string, type: FurnitureType, x: number, z: number, rotY: number, w: number, d: number, h: number, zone: ZoneId,
  extra: Partial<FurnitureDef> = {},
): FurnitureDef => ({ id, type, x, z, rotY, w, d, h, zone, ...extra });

/** Security cameras: [id, label, x, y, z, rotY (looking direction)]. */
export const CCTV: Array<[string, string, number, number, number, number]> = [
  ['cctv-entrance', 'CCTV · Entrance', 2.4, 4.2, 7.32, 0],
  ['cctv-lobby-e', 'CCTV · Reception (East)', 6.8, 3.6, 6.65, -2.18],
  ['cctv-lobby-w', 'CCTV · Reception (West)', -6.8, 3.6, 6.65, 2.18],
  ['cctv-ws-se', 'CCTV · Workspace SE', 11.85, 3.65, -0.35, -2.55],
  ['cctv-ws-ne', 'CCTV · Workspace NE', 11.85, 3.65, -29.7, -0.59],
  ['cctv-ws-nw', 'CCTV · Workspace NW', -4.25, 3.65, -29.7, 0.51],
  ['cctv-ws-sw', 'CCTV · Workspace SW', -4.25, 3.65, -0.35, 2.62],
  ['cctv-meeting', 'CCTV · Meeting Entrance', -4.6, 3.6, -3.1, -2.47],
  ['cctv-kitchen', 'CCTV · Pantry Hallway', -4.6, 3.6, -15.6, -0.76],
  ['cctv-director', 'CCTV · Director Corridor', -4.6, 3.6, -23.6, -0.71],
];

export const FURNITURE: FurnitureDef[] = [
  // Workspace clusters (5 horizontal islands × 10 desks)
  ...CLUSTER_Z.map((cz, i) => f(`cluster-${i + 1}`, 'deskCluster', CLUSTER_CENTER_X, cz, 0, DESKS_PER_ROW * DESK_WIDTH, DESK_DEPTH * 2, 0.76, 'workspace', { collider: true })),
  f('column-1', 'column', -4.5, -12.5, 0, 0.5, 0.5, CEILING_HEIGHT, 'workspace', { collider: true }),
  f('column-2', 'column', -4.5, -22.5, 0, 0.5, 0.5, CEILING_HEIGHT, 'workspace', { collider: true }),
  f('status-screen', 'statusScreen', 0, -0.2, PI, 2.6, 0.06, 1.46, 'workspace', { y: 2.0 }),
  f('ws-plant-1', 'tallPlant', -3.6, -0.6, 0, 0.5, 0.5, 1.7, 'workspace', { collider: true }),
  f('ws-plant-2', 'tallPlant', 3.6, -0.6, 0, 0.5, 0.5, 1.7, 'workspace', { collider: true }),
  f('ws-plant-3', 'tallPlant', -4.0, -29.4, 0, 0.5, 0.5, 1.8, 'lounge', { collider: true }),
  f('ws-plant-4', 'tallPlant', 11.45, -29.4, 0, 0.5, 0.5, 1.8, 'lounge', { collider: true }),
  f('ws-plant-5', 'plant', 3.5, -29.5, 0, 0.45, 0.45, 1.1, 'lounge', { collider: true }),
  f('ws-plant-6', 'tallPlant', 11.45, -0.6, 0, 0.5, 0.5, 1.8, 'workspace', { collider: true }),
  f('ws-plant-7', 'tallPlant', 11.45, -11.7, 0, 0.5, 0.5, 1.8, 'workspace', { collider: true }),
  f('ws-plant-8', 'tallPlant', 11.45, -18.3, 0, 0.5, 0.5, 1.8, 'workspace', { collider: true }),
  f('poster-mission', 'poster', 11.97, -8.0, -HALF, 1.2, 0.03, 1.6, 'workspace', { y: 1.8, variant: 'mission' }),
  f('poster-values', 'poster', 11.97, -22.0, -HALF, 1.2, 0.03, 1.6, 'workspace', { y: 1.8, variant: 'values' }),
  f('ws-fan-1', 'wallFan', -3.1, -0.2, PI, 0.5, 0.3, 0.5, 'workspace', { y: 2.7 }),
  f('ws-fan-2', 'wallFan', 3.1, -0.2, PI, 0.5, 0.3, 0.5, 'workspace', { y: 2.7 }),
  f('ws-fan-3', 'wallFan', 11.95, -10, -HALF, 0.5, 0.3, 0.5, 'workspace', { y: 2.7 }),
  f('ws-fan-4', 'wallFan', 11.95, -20, -HALF, 0.5, 0.3, 0.5, 'workspace', { y: 2.7 }),
  // East wall accents (solid wall: wood slats + posters + mural)
  f('east-slats-1', 'woodSlats', 11.97, -5.5, -HALF, 4.0, 0.06, 3.0, 'workspace', { y: 0.35 }),
  f('east-slats-2', 'woodSlats', 11.97, -24.5, -HALF, 4.0, 0.06, 3.0, 'workspace', { y: 0.35 }),
  // Hall of Fame: big LED leaderboard of the hardest-working people
  f('leaderboard', 'leaderboard', 11.93, -15, -HALF, 5.2, 0.12, 2.9, 'workspace', { y: 2.1 }),
  f('poster-mural', 'poster', 11.97, -5.5, -HALF, 3.0, 0.03, 1.4, 'workspace', { y: 2.1, variant: 'mural' }),
  f('poster-team', 'poster', 11.97, -24.5, -HALF, 3.0, 0.03, 1.4, 'workspace', { y: 2.1, variant: 'team' }),
  f('poster-south', 'poster', 9.6, -0.03, PI, 1.6, 0.03, 1.0, 'workspace', { y: 1.8, variant: 'focus' }),
  // Bridge-view lounge along the north glass façade
  f('bar-1', 'barCounter', -0.4, -29.6, 0, 6.6, 0.45, 1.05, 'lounge', { collider: true }),
  f('bar-2', 'barCounter', 7.4, -29.6, 0, 6.6, 0.45, 1.05, 'lounge', { collider: true }),

  // Reception / lobby
  f('reception-desk', 'receptionDesk', 0, 2.6, 0, 3.6, 0.8, 1.05, 'lobby', { collider: true }),
  f('logo-lobby', 'logoSign', 0, 0.16, 0, 4.4, 0.08, 2.1, 'lobby', { y: 2.25, variant: 'lobby' }),
  f('lobby-sofa', 'sofa', -6.4, 4.6, HALF, 1.9, 0.85, 0.8, 'lobby', { collider: true, variant: 'grey' }),
  f('lobby-table', 'coffeeTable', -4.9, 4.6, HALF, 1.0, 0.55, 0.4, 'lobby', { collider: true }),
  f('lobby-plant-1', 'tallPlant', -6.5, 6.35, 0, 0.5, 0.5, 1.7, 'lobby', { collider: true }),
  f('lobby-plant-2', 'tallPlant', 6.5, 6.35, 0, 0.5, 0.5, 1.7, 'lobby', { collider: true }),
  f('lobby-plant-3', 'plant', -6.5, 0.6, 0, 0.45, 0.45, 1.1, 'lobby', { collider: true }),
  f('lobby-plant-4', 'plant', 6.5, 0.65, 0, 0.45, 0.45, 1.1, 'lobby', { collider: true }),
  f('welcome-screen', 'welcomeScreen', 6.97, 3.5, -HALF, 1.7, 0.06, 0.96, 'lobby', { y: 1.75 }),
  // Face-recognition attendance check-in (left side of the black reception wall) + dashboard
  f('checkin-kiosk', 'kiosk', -3.4, 0.62, 0, 0.55, 0.45, 1.55, 'lobby', { collider: true }),
  f('checkin-sign', 'sign', -3.4, 0.165, 0, 1.5, 0.03, 0.42, 'lobby', { y: 2.55, variant: 'checkin' }),
  f('attendance-screen', 'attendanceScreen', -6.96, 2.35, HALF, 2.7, 0.08, 1.52, 'lobby', { y: 2.15 }),

  // Building corridor (outside the office)
  f('logo-facade', 'logoSign', -9.6, 7.17, 0, 5.2, 0.1, 2.5, 'outside', { y: 2.4, variant: 'facade' }),
  f('logo-door', 'logoSign', 0, 7.17, 0, 2.4, 0.08, 1.2, 'outside', { y: 3.6, variant: 'small' }),
  f('elevator-1', 'elevator', -3.5, 13.97, PI, 1.4, 0.2, 2.4, 'outside'),
  f('elevator-2', 'elevator', 3.5, 13.97, PI, 1.4, 0.2, 2.4, 'outside'),
  f('out-plant-1', 'tallPlant', -2.6, 7.75, 0, 0.55, 0.55, 1.7, 'outside', { collider: true }),
  f('out-plant-2', 'tallPlant', 2.6, 7.75, 0, 0.55, 0.55, 1.7, 'outside', { collider: true }),
  f('out-plant-3', 'tallPlant', -15.3, 13.3, 0, 0.55, 0.55, 1.7, 'outside', { collider: true }),
  f('out-plant-4', 'tallPlant', 15.3, 13.3, 0, 0.55, 0.55, 1.7, 'outside', { collider: true }),
  f('bench-1', 'bench', -9, 13.55, PI, 1.9, 0.5, 0.45, 'outside', { collider: true }),
  f('bench-2', 'bench', 9, 13.55, PI, 1.9, 0.5, 0.45, 'outside', { collider: true }),

  // Storage: shelves + lockers + file cabinets + storage cabinet + printer
  f('shelf-1', 'shelf', WX + 0.25, -1.3, HALF, 1.8, 0.45, 2.1, 'storage', { collider: true }),
  f('shelf-2', 'shelf', WX + 0.25, -3.3, HALF, 1.8, 0.45, 2.1, 'storage', { collider: true }),
  f('lockers', 'lockerBank', -11.4, -0.25, PI, 4.4, 0.45, 1.9, 'storage', { collider: true }),
  f('filecab-1', 'fileCabinet', -13.6, -4.05, 0, 0.5, 0.6, 1.3, 'storage', { collider: true }),
  f('filecab-2', 'fileCabinet', -12.95, -4.05, 0, 0.5, 0.6, 1.3, 'storage', { collider: true }),
  f('storage-cabinet', 'tallCabinet', -9.9, -4.15, 0, 0.9, 0.45, 2.0, 'storage', { collider: true }),
  f('printer', 'printer', -8.3, -3.95, 0, 0.65, 0.55, 1.0, 'storage', { collider: true }),
  f('storage-fan', 'wallFan', WX + 0.05, -2.3, HALF, 0.5, 0.3, 0.5, 'storage', { y: 2.7 }),

  // Meeting room
  f('meeting-table', 'meetingTable', MX, -8.3, 0, 1.4, 4.2, 0.75, 'meeting', { collider: true }),
  f('meeting-tv', 'tv', MX, -11.86, 0, 2.2, 0.06, 1.24, 'meeting', { y: 1.75 }),
  f('meeting-wb', 'whiteboard', WX + 0.06, -8.3, HALF, 2.6, 0.05, 1.25, 'meeting', { y: 1.5 }),
  f('meeting-plant-1', 'plant', WX + 0.6, -5.1, 0, 0.45, 0.45, 1.1, 'meeting', { collider: true }),
  f('meeting-plant-2', 'plant', -7.65, -11.4, 0, 0.45, 0.45, 1.1, 'meeting', { collider: true }),
  f('meeting-pendant', 'pendant', MX, -8.3, 0, 0.3, 3.4, 0.05, 'meeting', { y: 2.95, variant: 'linear' }),
  f('meeting-sign', 'sign', -6.99, -5.65, HALF, 1.0, 0.03, 0.28, 'corridor', { y: 2.65, variant: 'meeting' }),

  // Kitchen / pantry
  f('kitchen-counter', 'kitchenCounter', WX + 0.35, -15.5, HALF, 5.0, 0.65, 0.9, 'kitchen', { collider: true }),
  f('kitchen-upper', 'upperCabinets', WX + 0.18, -15.5, HALF, 5.0, 0.35, 0.7, 'kitchen', { y: 1.85 }),
  f('fridge', 'fridge', WX + 0.4, -18.55, HALF, 0.75, 0.7, 1.85, 'kitchen', { collider: true }),
  f('coffee-machine', 'coffeeMachine', WX + 0.28, -16.4, HALF, 0.32, 0.38, 0.42, 'kitchen', { y: 0.9 }),
  f('microwave', 'microwave', WX + 0.33, -13.45, HALF, 0.5, 0.36, 0.3, 'kitchen', { y: 0.9 }),
  f('water-dispenser', 'waterDispenser', WX + 0.35, -12.55, HALF, 0.36, 0.36, 1.1, 'kitchen', { collider: true }),
  f('cup-shelf', 'cupShelf', -12.2, -12.12, PI, 1.3, 0.24, 0.05, 'kitchen', { y: 1.5 }),
  f('snack-shelf', 'snackShelf', -8.6, -18.68, 0, 1.6, 0.4, 1.65, 'kitchen', { collider: true }),
  f('kitchen-table-1', 'roundTable', -10.6, -14.7, 0, 0.9, 0.9, 0.75, 'kitchen', { collider: true, variant: 'lunch' }),
  f('kitchen-table-2', 'roundTable', -10.6, -17.4, 0, 0.9, 0.9, 0.75, 'kitchen', { collider: true, variant: 'snack' }),
  f('kitchen-pendant-1', 'pendant', -10.6, -14.7, 0, 0.35, 0.35, 0.3, 'kitchen', { y: 2.6, variant: 'dome' }),
  f('kitchen-pendant-2', 'pendant', -10.6, -17.4, 0, 0.35, 0.35, 0.3, 'kitchen', { y: 2.6, variant: 'dome' }),
  f('kitchen-plant', 'plant', -12.6, -18.62, 0, 0.45, 0.45, 1.0, 'kitchen', { collider: true }),
  f('kitchen-poster', 'poster', -9.2, -12.12, PI, 1.1, 0.03, 1.5, 'kitchen', { y: 1.7, variant: 'pantry' }),
  f('kitchen-sign', 'sign', -6.94, -15.5, HALF, 1.6, 0.03, 0.42, 'corridor', { y: 3.2, variant: 'pantry' }),

  // Director office (premium)
  f('director-desk', 'directorDesk', MX, -27.2, 0, 2.6, 1.05, 0.76, 'director', { collider: true }),
  f('director-credenza', 'credenza', MX, -29.62, 0, 2.6, 0.42, 0.62, 'director', { collider: true }),
  f('director-bookshelf', 'bookshelf', WX + 0.22, -27.0, HALF, 2.6, 0.42, 2.6, 'director', { collider: true }),
  f('director-display', 'displayShelf', WX + 0.22, -24.3, HALF, 1.5, 0.42, 2.3, 'director', { collider: true }),
  f('director-slats', 'woodSlats', WX + 0.04, -21.4, HALF, 3.6, 0.06, 3.2, 'director', { y: 0.35 }),
  f('director-sofa', 'sofa', WX + 0.55, -21.4, HALF, 2.4, 0.9, 0.8, 'director', { collider: true, variant: 'leather' }),
  f('director-armchair-1', 'armchair', -11.75, -20.7, -HALF, 0.85, 0.85, 0.8, 'director', { collider: true, variant: 'leather' }),
  f('director-armchair-2', 'armchair', -11.75, -22.1, -HALF, 0.85, 0.85, 0.8, 'director', { collider: true, variant: 'leather' }),
  f('director-table', 'coffeeTable', -12.9, -21.4, HALF, 1.2, 0.65, 0.42, 'director', { collider: true, variant: 'marble' }),
  f('director-rug', 'rug', -12.9, -21.4, HALF, 3.4, 2.8, 0.01, 'director', { variant: 'premium' }),
  f('director-art', 'poster', -11.0, -19.12, PI, 2.4, 0.04, 1.4, 'director', { y: 2.2, variant: 'art' }),
  f('director-chandelier-1', 'chandelier', MX, -27.0, 0, 1.2, 1.2, 0.1, 'director', { y: 3.2 }),
  f('director-chandelier-2', 'chandelier', -12.9, -21.4, 0, 0.9, 0.9, 0.1, 'director', { y: 3.2 }),
  f('director-lamp', 'floorLamp', WX + 0.55, -29.4, 0, 0.4, 0.4, 1.7, 'director', { collider: true }),
  f('director-plant-1', 'tallPlant', -7.65, -29.4, 0, 0.6, 0.6, 1.9, 'director', { collider: true }),
  f('director-plant-2', 'tallPlant', WX + 0.5, -19.6, 0, 0.6, 0.6, 1.9, 'director', { collider: true }),
  f('director-plant-3', 'tallPlant', -7.65, -19.6, 0, 0.6, 0.6, 1.9, 'director', { collider: true }),
  f('director-sign', 'sign', -6.99, -20.75, HALF, 1.1, 0.03, 0.28, 'corridor', { y: 2.65, variant: 'director' }),

  // Security cameras
  ...CCTV.map(([id, , x, y, z, r]) => f(id, 'cctv', x, z, r, 0.2, 0.3, 0.2, ZONES.find((zn) => inRect(zn.rect, x, z, 0.4))?.id ?? 'workspace', { y })),
];

// ───────────────────────────────── Obstacles (collision) ─────────────────────────────────
export interface Obstacle {
  id: string;
  rect: Rect;
  y0: number;
  y1: number;
  kind: 'wall' | 'furniture' | 'chair';
}

/** Collider footprint per chair style — matches the visible base (5-star base ≈ 0.58 m). */
export const CHAIR_FOOTPRINT: Record<ChairStyle, number> = { office: 0.58, executive: 0.62, wood: 0.48, stool: 0.46, none: 0 };

export const OBSTACLES: Obstacle[] = [
  ...WALL_PIECES.filter((p) => p.y0 < 1.0).map((p, i) => ({ id: `${p.wallId}#${i}`, rect: p.rect, y0: p.y0, y1: p.y1, kind: 'wall' as const })),
  ...FURNITURE.filter((it) => it.collider).map((it) => ({
    id: it.id,
    rect: rectFromCenter(it.x, it.z, it.w, it.d, it.rotY),
    y0: 0,
    y1: it.h,
    kind: 'furniture' as const,
  })),
  ...SEATS.filter((s) => s.chair !== 'none').map((s) => ({
    id: `chair:${s.id}`,
    rect: rectFromCenter(s.x, s.z, CHAIR_FOOTPRINT[s.chair], CHAIR_FOOTPRINT[s.chair]),
    y0: 0,
    y1: s.chair === 'stool' ? 0.8 : 1.1,
    kind: 'chair' as const,
  })),
];

// ───────────────────────────────── Interactables ─────────────────────────────────
export type InteractKind = 'seat' | 'door' | 'toggle' | 'timed' | 'tv' | 'whiteboard' | 'view' | 'lamp' | 'checkin';

export interface InteractableDef {
  id: string;
  kind: InteractKind;
  label: string;
  /** Prompt verb shown next to the key, e.g. "OPEN". */
  verb: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  zone: ZoneId;
  seatId?: string;
}

export const LOCKER_COUNT = 8;
export const lockerDoorPos = (i: number) => ({ x: -13.6 + 0.2 + i * 0.4, y: 0.95, z: -0.48 });

export const INTERACTABLES: InteractableDef[] = [
  ...DOORS.map((d) => {
    const c = doorCenter(d);
    return { id: d.id, kind: 'door' as const, label: d.label, verb: 'OPEN / CLOSE', x: c.x, y: 1.1, z: c.z, radius: 1.9, zone: d.zones[1] };
  }),
  { id: 'checkin', kind: 'checkin', label: 'Face ID Attendance', verb: 'FACE CHECK-IN', x: -3.4, y: 1.3, z: 1.05, radius: 1.7, zone: 'lobby' },
  { id: 'fridge', kind: 'toggle', label: 'Fridge', verb: 'OPEN / CLOSE', x: WX + 0.8, y: 1.0, z: -18.55, radius: 1.6, zone: 'kitchen' },
  { id: 'kcab-1', kind: 'toggle', label: 'Kitchen Cabinet', verb: 'OPEN / CLOSE', x: WX + 0.4, y: 1.85, z: -14.0, radius: 1.5, zone: 'kitchen' },
  { id: 'kcab-2', kind: 'toggle', label: 'Kitchen Cabinet', verb: 'OPEN / CLOSE', x: WX + 0.4, y: 1.85, z: -17.0, radius: 1.5, zone: 'kitchen' },
  { id: 'coffee', kind: 'timed', label: 'Coffee Machine', verb: 'BREW COFFEE', x: WX + 0.4, y: 1.1, z: -16.4, radius: 1.5, zone: 'kitchen' },
  { id: 'microwave', kind: 'timed', label: 'Microwave', verb: 'HEAT LUNCH', x: WX + 0.4, y: 1.05, z: -13.45, radius: 1.4, zone: 'kitchen' },
  { id: 'water', kind: 'timed', label: 'Water Dispenser', verb: 'GET WATER', x: WX + 0.5, y: 0.9, z: -12.55, radius: 1.4, zone: 'kitchen' },
  ...Array.from({ length: LOCKER_COUNT }, (_, i) => {
    const p = lockerDoorPos(i);
    return { id: `locker-${i + 1}`, kind: 'toggle' as const, label: `Locker ${i + 1}`, verb: 'OPEN / CLOSE', x: p.x, y: p.y, z: p.z, radius: 1.3, zone: 'storage' as const };
  }),
  { id: 'filecab-1', kind: 'toggle', label: 'File Cabinet', verb: 'OPEN DRAWER', x: -13.6, y: 0.9, z: -3.7, radius: 1.3, zone: 'storage' },
  { id: 'filecab-2', kind: 'toggle', label: 'File Cabinet', verb: 'OPEN DRAWER', x: -12.95, y: 0.9, z: -3.7, radius: 1.3, zone: 'storage' },
  { id: 'printer', kind: 'timed', label: 'Printer', verb: 'PRINT PAGE', x: -8.3, y: 1.0, z: -3.6, radius: 1.4, zone: 'storage' },
  { id: 'tv-meeting', kind: 'tv', label: 'Meeting Room TV', verb: 'TV ON/OFF · NEXT SLIDE', x: MX, y: 1.4, z: -11.2, radius: 2.2, zone: 'meeting' },
  { id: 'wb-meeting', kind: 'whiteboard', label: 'Whiteboard', verb: 'WRITE NOTES', x: WX + 0.7, y: 1.4, z: -8.3, radius: 1.8, zone: 'meeting' },
  { id: 'lamp-director', kind: 'lamp', label: 'Floor Lamp', verb: 'LIGHT ON/OFF', x: WX + 0.55, y: 1.2, z: -29.1, radius: 1.5, zone: 'director' },
  { id: 'view-bridge', kind: 'view', label: 'Thuận Phước Bridge View', verb: 'ENJOY THE VIEW', x: 3.5, y: 1.5, z: -29.2, radius: 1.8, zone: 'lounge' },
  ...SEATS.map((s) => ({
    id: `seat:${s.id}`,
    kind: 'seat' as const,
    label: s.label,
    verb: s.kind === 'desk' ? 'SIT & START WORKING' : 'SIT',
    x: s.x,
    y: 0.6,
    z: s.z,
    radius: 1.5,
    zone: s.zone,
    seatId: s.id,
  })),
];

export const INTERACTABLE_BY_ID: Record<string, InteractableDef> = Object.fromEntries(INTERACTABLES.map((i) => [i.id, i]));

/** Default synced object states (0 = closed/off, 1 = open/on, timestamps for timed objects). */
export const DEFAULT_OBJECT_STATES: Record<string, number> = {
  ...Object.fromEntries(INTERACTABLES.filter((i) => i.kind === 'door' || i.kind === 'toggle').map((i) => [i.id, 0])),
  coffee: 0,
  water: 0,
  microwave: 0,
  printer: 0,
  'tv-meeting': 0,
  'lamp-director': 1,
};

export const WHITEBOARD_IDS = ['wb-meeting'] as const;
export const TV_SLIDE_COUNT = 4;

// ───────────────────────────────── Spawn / cameras / navigation ─────────────────────────────────
export const SPAWN = { x: 0, z: 11.2, rotY: PI, spreadX: 2.4, spreadZ: 1.0 };

export interface CameraPreset {
  id: string;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
  zone?: ZoneId;
  hideCeiling?: boolean;
  group?: 'room' | 'cctv';
}

export const CAMERA_PRESETS: CameraPreset[] = [
  { id: 'entrance', label: 'Entrance & Façade', position: [5.8, 2.6, 13.6], target: [-2, 2.3, 7], zone: 'outside', group: 'room' },
  { id: 'reception', label: 'Reception Camera', position: [4.8, 3.0, 6.4], target: [-0.6, 1.5, 0.4], zone: 'lobby', group: 'room' },
  { id: 'checkin', label: 'Attendance Check-in Camera', position: [0.6, 2.4, 4.9], target: [-4.6, 1.45, 1.3], zone: 'lobby', group: 'room' },
  { id: 'workspace', label: 'Main Workspace Camera', position: [10.8, 3.6, -0.7], target: [2.5, 0.5, -15], zone: 'workspace', group: 'room' },
  { id: 'meeting', label: 'Meeting Room Camera', position: [-7.55, 3.4, -4.95], target: [-11.6, 0.8, -9.5], zone: 'meeting', group: 'room' },
  { id: 'kitchen', label: 'Kitchen Camera', position: [-7.55, 3.4, -12.45], target: [-12.8, 0.8, -16.8], zone: 'kitchen', group: 'room' },
  { id: 'director', label: 'Director Office Camera', position: [-7.6, 3.4, -19.5], target: [-12.2, 0.8, -26.5], zone: 'director', group: 'room' },
  { id: 'leaderboard', label: 'Hall of Fame (Leaderboard)', position: [5.2, 2.0, -15], target: [12, 2.0, -15], zone: 'workspace', group: 'room' },
  { id: 'storage', label: 'Storage Camera', position: [-5.2, 3.2, -0.4], target: [-12.5, 1, -2.6], zone: 'storage', group: 'room' },
  { id: 'bridge', label: 'Thuận Phước Bridge View', position: [3.5, 1.65, -28.6], target: [3.5, -4.5, -200], zone: 'lounge', group: 'room' },
  { id: 'overview', label: 'Office Overview', position: [0, 48, 30], target: [-1.5, 0, -12], hideCeiling: true },
  ...CCTV.map(([id, label, x, y, z, r]): CameraPreset => {
    const fx = Math.sin(r);
    const fz = Math.cos(r);
    return { id, label, position: [x + fx * 0.25, y - 0.12, z + fz * 0.25], target: [x + fx * 10, 0.4, z + fz * 10], group: 'cctv' };
  }),
];

export interface NavNode {
  id: string;
  x: number;
  z: number;
}

export const NAV_NODES: NavNode[] = [
  { id: 'OUT', x: 0, z: 11 },
  { id: 'ENT', x: 0, z: 7.8 },
  { id: 'DOOR', x: 0, z: 6.0 },
  { id: 'LOB', x: 0, z: 4.2 },
  { id: 'CHK', x: -3.4, z: 1.75 },
  { id: 'LOBL', x: -5.75, z: 3.3 },
  { id: 'LOBR', x: 5.75, z: 3.3 },
  { id: 'AL', x: -5.75, z: -0.8 },
  { id: 'AR', x: 5.75, z: -0.8 },
  { id: 'CST', x: -5.75, z: -2.3 },
  { id: 'ST', x: -11.4, z: -2.3 },
  { id: 'CMEET', x: -5.75, z: -5.7 },
  { id: 'MD', x: -7.9, z: -5.7 },
  { id: 'M', x: -8.35, z: -8.3 },
  { id: 'CKIT', x: -5.75, z: -13.2 },
  { id: 'KD', x: -7.9, z: -13.2 },
  { id: 'K', x: -8.4, z: -15.9 },
  { id: 'CDIR', x: -5.75, z: -20.75 },
  { id: 'DD', x: -7.9, z: -20.75 },
  { id: 'D', x: -9.3, z: -23.8 },
  { id: 'CEND', x: -5.75, z: -27.8 },
  { id: 'WF', x: 3.5, z: -2.3 },
  { id: 'WL0', x: -2.4, z: -2.3 },
  { id: 'WL1', x: -2.4, z: -7.5 },
  { id: 'WL2', x: -2.4, z: -12.5 },
  { id: 'WL3', x: -2.4, z: -17.5 },
  { id: 'WL4', x: -2.4, z: -22.5 },
  { id: 'WL5', x: -2.4, z: -27.6 },
  { id: 'WR0', x: 9.6, z: -2.3 },
  { id: 'WR1', x: 9.6, z: -7.5 },
  { id: 'WR2', x: 9.6, z: -12.5 },
  { id: 'WR3', x: 9.6, z: -17.5 },
  { id: 'WR4', x: 9.6, z: -22.5 },
  { id: 'WR5', x: 9.6, z: -27.6 },
  { id: 'LG', x: 3.5, z: -27.6 },
];

export const NAV_EDGES: Array<[string, string]> = [
  ['OUT', 'ENT'], ['ENT', 'DOOR'], ['DOOR', 'LOB'], ['LOB', 'LOBL'], ['LOB', 'LOBR'], ['LOBL', 'AL'], ['LOBR', 'AR'],
  ['LOB', 'CHK'], ['CHK', 'LOBL'],
  ['AL', 'CST'], ['CST', 'ST'], ['CST', 'CMEET'], ['CMEET', 'MD'], ['MD', 'M'], ['CMEET', 'CKIT'], ['CKIT', 'KD'], ['KD', 'K'],
  ['CKIT', 'K'], ['CKIT', 'CDIR'], ['CDIR', 'DD'], ['DD', 'D'], ['CDIR', 'CEND'],
  ['AL', 'WL0'], ['AR', 'WF'], ['AR', 'WR0'], ['WF', 'WL0'], ['WF', 'WR0'],
  ['WL0', 'WL1'], ['WL1', 'WL2'], ['WL2', 'WL3'], ['WL3', 'WL4'], ['WL4', 'WL5'],
  ['WR0', 'WR1'], ['WR1', 'WR2'], ['WR2', 'WR3'], ['WR3', 'WR4'], ['WR4', 'WR5'],
  ['WL1', 'WR1'], ['WL2', 'WR2'], ['WL3', 'WR3'], ['WL4', 'WR4'],
  ['WL5', 'LG'], ['LG', 'WR5'],
  ['CMEET', 'WL1'], ['CKIT', 'WL3'], ['CDIR', 'WL4'], ['CEND', 'WL5'], ['CST', 'WL0'],
];

/** Navigation destination node for each named room. */
export const ROOM_NAV_TARGET: Partial<Record<ZoneId, string>> = {
  outside: 'OUT',
  lobby: 'LOB',
  storage: 'ST',
  meeting: 'M',
  kitchen: 'K',
  director: 'D',
  workspace: 'WF',
  lounge: 'LG',
};

/** World bounds of everything walkable (for minimap framing). */
export const MAP_BOUNDS: Rect = rect(-16.5, 16.5, -30.6, 14.4);

/** Door that connects a private room to the corridor. */
export const DOOR_OF_ZONE: Partial<Record<ZoneId, string>> = Object.fromEntries(DOORS.map((d) => [d.zones[0], d.id]));

/**
 * Private rooms (meeting, director) are sound-proof: nothing passes between a closed
 * room and the outside unless its door is open. Open areas always hear each other.
 */
export function zonesConnected(a: ZoneId | null, b: ZoneId | null, objects: (id: string) => number | undefined): boolean {
  if (!a || !b || a === b) return true;
  const ea = ZONE_BY_ID[a]?.enclosed;
  const eb = ZONE_BY_ID[b]?.enclosed;
  if (!ea && !eb) return true;
  if (ea && eb) return false;
  const door = DOOR_OF_ZONE[ea ? a : b];
  return !!door && (objects(door) ?? 0) > 0;
}
