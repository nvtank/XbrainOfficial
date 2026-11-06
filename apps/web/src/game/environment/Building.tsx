/** Floors, walls (opaque + glass curtain walls), ceilings with LED panels & exposed services. */
import { useMemo } from 'react';
import * as THREE from 'three';
import { CEILING_HEIGHT, FACADE_HEIGHT, WALL_PIECES, ZONES, rectSize, type FloorKind, type WallPiece } from '@xbrain/shared';
import { Batch } from './batch';
import { FLOOR_TEX_SIZE, FROSTED, GLASS, floorTextures, type MatKey } from './materials';
import { buildStaticFurniture } from './furniture';
import { useGame } from '../../stores/game';
import { CAMERA_PRESETS } from '@xbrain/shared';

const OPAQUE: Record<string, MatKey> = { white: 'wall', black: 'wallBlack', facade: 'facade', corridor: 'corridorWall' };

function floorMaterial(kind: FloorKind | 'stone') {
  const tex = floorTextures();
  const map: Record<string, { t: THREE.Texture; rough: number; metal?: number }> = {
    stone: { t: tex.stone, rough: 0.35 },
    tile: { t: tex.tile, rough: 0.38 },
    carpet: { t: tex.carpet, rough: 0.98 },
    wood: { t: tex.wood, rough: 0.55 },
    kitchenTile: { t: tex.kitchenTile, rough: 0.4 },
    meetingCarpet: { t: tex.meetingCarpet, rough: 0.98 },
  };
  const m = map[kind];
  return new THREE.MeshStandardMaterial({ map: m.t, roughness: m.rough, metalness: m.metal ?? 0 });
}

function Floors() {
  const meshes = useMemo(() => {
    const mats = new Map<string, THREE.Material>();
    return ZONES.map((z) => {
      const { w, d } = rectSize(z.rect);
      const geo = new THREE.PlaneGeometry(w + 0.3, d + 0.3);
      geo.rotateX(-Math.PI / 2);
      const ts = FLOOR_TEX_SIZE[z.floor];
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const cx = (z.rect.minX + z.rect.maxX) / 2;
      const cz = (z.rect.minZ + z.rect.maxZ) / 2;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + cx) / ts, -(pos.getZ(i) + cz) / ts);
      if (!mats.has(z.floor)) mats.set(z.floor, floorMaterial(z.floor));
      return { id: z.id, geo, mat: mats.get(z.floor)!, pos: [cx, z.id === 'workspace' || z.id === 'corridor' ? 0.0 : 0.002, cz] as [number, number, number] };
    });
  }, []);
  return (
    <group>
      {meshes.map((m) => (
        <mesh key={m.id} geometry={m.geo} material={m.mat} position={m.pos} receiveShadow />
      ))}
    </group>
  );
}

function glassWall(b: Batch, glass: THREE.BufferGeometry[], frosted: THREE.BufferGeometry[], p: WallPiece) {
  const { w, d } = rectSize(p.rect);
  const alongX = w > d;
  const len = alongX ? w : d;
  const cx = (p.rect.minX + p.rect.maxX) / 2;
  const cz = (p.rect.minZ + p.rect.maxZ) / 2;
  const h = p.y1 - p.y0;
  const pane = new THREE.BoxGeometry(alongX ? len : 0.02, h, alongX ? 0.02 : len);
  pane.translate(cx, p.y0 + h / 2, cz);
  glass.push(pane);
  if (p.material === 'frosted') {
    const band = new THREE.BoxGeometry(alongX ? len : 0.025, 0.9, alongX ? 0.025 : len);
    band.translate(cx, 1.4, cz);
    frosted.push(band);
  }
  // Mullions every ~1.5 m + sill + head
  const n = Math.max(1, Math.round(len / 1.5));
  const step = len / n;
  const start = alongX ? p.rect.minX : p.rect.minZ;
  for (let i = 0; i <= n; i++) {
    const t = start + i * step;
    if (alongX) b.box('mullion', 0.05, h, 0.09, t, p.y0 + h / 2, cz);
    else b.box('mullion', 0.09, h, 0.05, cx, p.y0 + h / 2, t);
  }
  if (p.y0 === 0) b.box('mullion', alongX ? len : 0.1, 0.08, alongX ? 0.1 : len, cx, 0.04, cz);
  b.box('mullion', alongX ? len : 0.1, 0.06, alongX ? 0.1 : len, cx, p.y1 - 0.03, cz);
}

function buildWalls() {
  const b = new Batch();
  const glass: THREE.BufferGeometry[] = [];
  const frosted: THREE.BufferGeometry[] = [];
  for (const p of WALL_PIECES) {
    const mat = OPAQUE[p.material];
    if (mat) {
      const { w, d } = rectSize(p.rect);
      b.box(mat, w, p.y1 - p.y0, d, (p.rect.minX + p.rect.maxX) / 2, (p.y0 + p.y1) / 2, (p.rect.minZ + p.rect.maxZ) / 2);
      // Skirting on white walls
      if (p.material === 'white' && p.y0 === 0) b.box('black', w + 0.004, 0.08, d + 0.004, (p.rect.minX + p.rect.maxX) / 2, 0.04, (p.rect.minZ + p.rect.maxZ) / 2);
    } else glassWall(b, glass, frosted, p);
  }
  // Façade wood accent strips & door frame
  b.box('facadeWood', 0.25, FACADE_HEIGHT, 0.04, -4.62, FACADE_HEIGHT / 2, 7.17);
  b.box('facadeWood', 0.25, FACADE_HEIGHT, 0.04, 4.62, FACADE_HEIGHT / 2, 7.17);
  b.box('mullion', 3.2, 0.12, 0.2, 0, 2.76, 7);
  const group = b.build({ castShadow: true, receiveShadow: true });
  return { group, glass, frosted };
}

function Walls() {
  const { group, glassMesh, frostedMesh } = useMemo(() => {
    const { group, glass, frosted } = buildWalls();
    const merge = (list: THREE.BufferGeometry[], mat: THREE.Material) => {
      const g = new THREE.Group();
      for (const geo of list) {
        const m = new THREE.Mesh(geo, mat);
        m.renderOrder = 2;
        g.add(m);
      }
      return g;
    };
    return { group, glassMesh: merge(glass, GLASS), frostedMesh: merge(frosted, FROSTED) };
  }, []);
  return (
    <group>
      <primitive object={group} />
      <primitive object={glassMesh} />
      <primitive object={frostedMesh} />
    </group>
  );
}

function buildCeiling() {
  const b = new Batch();
  const H = CEILING_HEIGHT;
  // Black exposed ceiling over open areas, white finished ceiling in rooms & lobby
  for (const z of ZONES) {
    const { w, d } = rectSize(z.rect);
    const cx = (z.rect.minX + z.rect.maxX) / 2;
    const cz = (z.rect.minZ + z.rect.maxZ) / 2;
    const finished = z.id === 'meeting' || z.id === 'kitchen' || z.id === 'director' || z.id === 'lobby';
    const h = z.id === 'outside' ? FACADE_HEIGHT : H;
    b.box(finished ? 'ceilingWhite' : 'ceiling', w + 0.4, 0.1, d + 0.4, cx, h + 0.05, cz);
  }
  // LED panels in the workspace (hanging, like the real office)
  for (let x = -1.5; x <= 9; x += 3.5)
    for (let z = -2.5; z >= -28.5; z -= 3.3) {
      b.box('led', 1.2, 0.03, 0.6, x, 2.9, z);
      b.box('blackMetal', 1.24, 0.035, 0.64, x, 2.92, z);
      b.cyl('steel', 0.004, 0.004, 0.3, x - 0.5, 3.07, z, 4);
      b.cyl('steel', 0.004, 0.004, 0.3, x + 0.5, 3.07, z, 4);
    }
  // Corridor & storage & lounge downlights
  for (let z = -2; z >= -29; z -= 3) b.cyl('led', 0.08, 0.08, 0.02, -5.75, 3.14, z, 12);
  for (let z = -2; z >= -29; z -= 3) b.cyl('led', 0.08, 0.08, 0.02, 11.1, 3.14, z, 12);
  for (const [x, z] of [[-12, -1.5], [-9, -1.5], [-12, -3.5], [-9, -3.5]]) b.box('led', 0.6, 0.02, 0.6, x, 3.18, z);
  // Rooms: recessed square panels
  for (const [x, z] of [[-12.3, -6.5], [-8.7, -6.5], [-12.3, -10.2], [-8.7, -10.2], [-12, -14], [-12, -17.5], [-8.6, -14], [-8.6, -17.5], [-12, -21], [-9, -21], [-12, -24.5], [-9, -24.5], [-12, -28], [-9, -28]])
    b.box('led', 0.6, 0.02, 0.6, x, 3.19, z);
  // Lobby downlights + entrance corridor
  for (let x = -6; x <= 6; x += 2) for (const z of [1.2, 4.0, 6.2]) b.cyl('ledWarm', 0.07, 0.07, 0.02, x, 3.19, z, 12);
  for (let x = -14; x <= 14; x += 2.5) b.cyl('led', 0.09, 0.09, 0.02, x, FACADE_HEIGHT - 0.01, 10.5, 12);
  // Exposed services: ducts + red sprinkler pipes
  for (const x of [-0.2, 8.2]) b.cyl('duct', 0.24, 0.24, 30, x, 3.0, -15, 14, [Math.PI / 2, 0, 0]);
  for (const z of [-4.2, -12.4, -20.6, -27.6]) b.cyl('pipeRed', 0.035, 0.035, 16, 3.5, 3.08, z, 8, [0, 0, Math.PI / 2]);
  b.cyl('pipeRed', 0.04, 0.04, 30, 5.8, 3.1, -15, 8, [Math.PI / 2, 0, 0]);
  for (let z = -4; z >= -28; z -= 4) b.cyl('pipeRed', 0.015, 0.015, 0.2, 5.8, 2.97, z, 6);
  return b.build({ castShadow: false, receiveShadow: false });
}

function Ceiling() {
  const group = useMemo(buildCeiling, []);
  const hidden = useGame((s) => s.cameraMode === 'overview' || (s.cameraMode === 'preset' && !!CAMERA_PRESETS.find((p) => p.id === s.cameraPreset)?.hideCeiling));
  return <primitive object={group} visible={!hidden} />;
}

function StaticFurniture({ shadows }: { shadows: boolean }) {
  const group = useMemo(() => buildStaticFurniture().build({ castShadow: shadows, receiveShadow: true }), [shadows]);
  return <primitive object={group} />;
}

/** Ceiling slab that blocks the sun (keeps interiors lit only through windows). */
function RoofShadowCaster() {
  const geo = useMemo(() => new THREE.BoxGeometry(34, 0.3, 46), []);
  const hidden = useGame((s) => s.cameraMode === 'overview' || s.cameraMode === 'preset');
  return (
    <mesh geometry={geo} position={[0, CEILING_HEIGHT + 1.35, -8]} castShadow visible={!hidden}>
      <meshBasicMaterial colorWrite={false} depthWrite={false} />
    </mesh>
  );
}

export function Building({ shadows }: { shadows: boolean }) {
  return (
    <group>
      <Floors />
      <Walls />
      <Ceiling />
      <StaticFurniture shadows={shadows} />
      {shadows && <RoofShadowCaster />}
    </group>
  );
}
