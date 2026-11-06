/** Animated / stateful objects driven by the synced object states (doors, fridge, lockers, TV, screens…). */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  DESKS,
  DOORS,
  ENTRANCE_DOOR,
  FURNITURE,
  LOCKER_COUNT,
  SEAT_BY_ID,
  TOTAL_DESKS,
  lockerDoorPos,
  type DoorDef,
} from '@xbrain/shared';
import { useWorld } from '../../stores/world';
import { runtime } from '../runtime';
import { GLASS, MATS, monitorTexture } from './materials';
import { formatHMS, serverNow, workElapsed } from '../../services/clock';
import { sfx } from '../../services/sfx';

const damp = THREE.MathUtils.damp;
const useObj = (id: string) => useWorld((s) => s.objects[id] ?? 0);

// ───────────────────────────── doors ─────────────────────────────
function RoomDoor({ d }: { d: DoorDef }) {
  const open = useObj(d.id) > 0;
  const pivot = useRef<THREE.Group>(null!);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    sfx.door();
  }, [open]);
  useFrame((_, dt) => {
    pivot.current.rotation.y = damp(pivot.current.rotation.y, open ? d.swing : 0, 6, dt);
  });
  const glass = d.style === 'glass';
  const leafLen = d.width - 0.02;
  return (
    <group ref={pivot} position={[d.hinge.x, 0, d.hinge.z]}>
      <group position={[0, 0, (d.dir * d.width) / 2]}>
        {glass ? (
          <>
            <mesh material={GLASS} position={[0, 1.1, 0]} renderOrder={2}>
              <boxGeometry args={[0.025, 2.16, leafLen]} />
            </mesh>
            <mesh material={MATS.mullion} position={[0, 2.2, 0]}>
              <boxGeometry args={[0.05, 0.05, leafLen]} />
            </mesh>
            <mesh material={MATS.mullion} position={[0, 0.03, 0]}>
              <boxGeometry args={[0.05, 0.06, leafLen]} />
            </mesh>
            <mesh material={MATS.orange} position={[0, 1.1, 0]}>
              <boxGeometry args={[0.03, 0.05, leafLen * 0.9]} />
            </mesh>
          </>
        ) : (
          <mesh material={MATS.woodWarm} position={[0, 1.11, 0]} castShadow>
            <boxGeometry args={[0.045, 2.2, leafLen]} />
          </mesh>
        )}
        {[-1, 1].map((s) => (
          <mesh key={s} material={MATS.steel} position={[s * 0.05, 1.05, (-d.dir * leafLen) / 2 + d.dir * 0.1]}>
            <boxGeometry args={[0.03, 0.3, 0.025]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function EntranceDoors() {
  const left = useRef<THREE.Mesh>(null!);
  const right = useRef<THREE.Mesh>(null!);
  const openRef = useRef(0);
  const wasOpen = useRef(false);
  useFrame((_, dt) => {
    const r2 = ENTRANCE_DOOR.triggerRadius ** 2;
    const near = (p: THREE.Vector3) => (p.x - ENTRANCE_DOOR.x) ** 2 + (p.z - ENTRANCE_DOOR.z) ** 2 < r2;
    let open = near(runtime.local.pos);
    if (!open) for (const p of runtime.remotePos.values()) if (near(p)) { open = true; break; }
    if (open !== wasOpen.current) {
      wasOpen.current = open;
      if (Math.hypot(runtime.local.pos.x, runtime.local.pos.z - 7) < 12) sfx.door();
    }
    openRef.current = damp(openRef.current, open ? 1 : 0, 5, dt);
    runtime.entranceOpen = openRef.current;
    const w = ENTRANCE_DOOR.width / 2;
    left.current.position.x = -w / 2 - openRef.current * w * 0.95;
    right.current.position.x = w / 2 + openRef.current * w * 0.95;
  });
  const w = ENTRANCE_DOOR.width / 2;
  return (
    <group position={[0, 0, ENTRANCE_DOOR.z + 0.12]}>
      {[left, right].map((ref, i) => (
        <mesh key={i} ref={ref} material={GLASS} position={[i ? w / 2 : -w / 2, ENTRANCE_DOOR.height / 2, 0]} renderOrder={2}>
          <boxGeometry args={[w, ENTRANCE_DOOR.height - 0.02, 0.025]} />
          <mesh material={MATS.mullion} position={[0, 0, 0]}>
            <boxGeometry args={[w, 0.04, 0.03]} />
          </mesh>
          <mesh material={MATS.orange} position={[i ? -w / 2 + 0.08 : w / 2 - 0.08, 0, 0.02]}>
            <boxGeometry args={[0.03, 0.9, 0.03]} />
          </mesh>
        </mesh>
      ))}
    </group>
  );
}

// ───────────────────────────── cabinets & appliances ─────────────────────────────
function HingedPanel({
  id, pos, rotY, w, h, d = 0.02, material, openAngle, hingeSide = 1, children,
}: {
  id: string; pos: [number, number, number]; rotY: number; w: number; h: number; d?: number; material: THREE.Material; openAngle: number; hingeSide?: 1 | -1; children?: React.ReactNode;
}) {
  const open = useObj(id) > 0;
  const ref = useRef<THREE.Group>(null!);
  useFrame((_, dt) => {
    ref.current.rotation.y = damp(ref.current.rotation.y, open ? openAngle * hingeSide : 0, 7, dt);
  });
  return (
    <group position={pos} rotation={[0, rotY, 0]}>
      <group ref={ref} position={[(hingeSide * w) / 2, 0, 0]}>
        <mesh material={material} position={[(-hingeSide * w) / 2, 0, 0]} castShadow>
          <boxGeometry args={[w, h, d]} />
        </mesh>
        <mesh material={MATS.blackMetal} position={[-hingeSide * (w - 0.05), 0, d / 2 + 0.01]}>
          <boxGeometry args={[0.015, Math.min(0.2, h * 0.5), 0.02]} />
        </mesh>
        {children}
      </group>
    </group>
  );
}

function Fridge() {
  const f = FURNITURE.find((x) => x.type === 'fridge')!;
  return (
    <group position={[f.x, 0, f.z]} rotation={[0, f.rotY, 0]}>
      <mesh material={MATS.steel} position={[0, f.h / 2, -0.02]} castShadow>
        <boxGeometry args={[f.w, f.h, f.d - 0.04]} />
      </mesh>
      <mesh material={MATS.ceramicWhite} position={[0, f.h / 2, 0.0]}>
        <boxGeometry args={[f.w - 0.06, f.h - 0.06, f.d - 0.1]} />
      </mesh>
      {/* Shelves & items visible when opened */}
      {[0.5, 0.95, 1.4].map((y) => (
        <mesh key={y} material={GLASS} position={[0, y, 0.02]}>
          <boxGeometry args={[f.w - 0.1, 0.01, f.d - 0.15]} />
        </mesh>
      ))}
      <mesh material={MATS.orange} position={[-0.15, 1.06, 0.05]}>
        <cylinderGeometry args={[0.04, 0.04, 0.2, 10]} />
      </mesh>
      <mesh material={MATS.bookE} position={[0.1, 0.6, 0.05]}>
        <boxGeometry args={[0.18, 0.16, 0.12]} />
      </mesh>
      <mesh material={MATS.ledWarm} position={[0, f.h - 0.12, -0.1]}>
        <boxGeometry args={[0.2, 0.02, 0.05]} />
      </mesh>
      <HingedPanel id="fridge" pos={[0, f.h / 2, f.d / 2 - 0.02]} rotY={0} w={f.w} h={f.h - 0.02} d={0.05} material={MATS.steel} openAngle={-1.9} hingeSide={-1}>
        <mesh material={MATS.blackMetal} position={[f.w - 0.08, 0.2, 0.04]}>
          <boxGeometry args={[0.025, 0.5, 0.03]} />
        </mesh>
      </HingedPanel>
    </group>
  );
}

function KitchenCabinetDoors() {
  // Upper cabinets: rotY = π/2 along the west wall; door local x = ±1.5625 → world z.
  const up = FURNITURE.find((x) => x.type === 'upperCabinets')!;
  const y = up.y ?? 1.85;
  const fx = up.x + up.d / 2 + 0.005;
  return (
    <group>
      <HingedPanel id="kcab-1" pos={[fx, y, up.z + 1.5625]} rotY={Math.PI / 2} w={0.6} h={up.h - 0.02} material={MATS.kitchenRed} openAngle={-1.7} />
      <HingedPanel id="kcab-2" pos={[fx, y, up.z - 1.5625]} rotY={Math.PI / 2} w={0.6} h={up.h - 0.02} material={MATS.kitchenRed} openAngle={-1.7} />
      {[1.5625, -1.5625].map((dz) => (
        <group key={dz} position={[fx - 0.17, y - 0.12, up.z + dz]}>
          {[-0.15, 0, 0.15].map((o) => (
            <mesh key={o} material={o === 0 ? MATS.orange : MATS.ceramicWhite} position={[0, 0, o]}>
              <cylinderGeometry args={[0.04, 0.035, 0.1, 10]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Lockers() {
  const lockers = FURNITURE.find((x) => x.type === 'lockerBank')!;
  return (
    <group>
      {Array.from({ length: LOCKER_COUNT }, (_, i) => {
        const p = lockerDoorPos(i);
        return (
          <HingedPanel key={i} id={`locker-${i + 1}`} pos={[p.x, p.y, lockers.z - lockers.d / 2 - 0.0]} rotY={Math.PI} w={0.388} h={0.62} material={MATS.whiteMetal} openAngle={-1.8}>
            <mesh material={MATS.orange} position={[-0.14, 0.26, 0.012]}>
              <boxGeometry args={[0.05, 0.02, 0.004]} />
            </mesh>
          </HingedPanel>
        );
      })}
    </group>
  );
}

function FileDrawers() {
  return (
    <group>
      {(['filecab-1', 'filecab-2'] as const).map((id) => {
        const f = FURNITURE.find((x) => x.id === id)!;
        return <Drawer key={id} id={id} x={f.x} z={f.z} w={f.w} d={f.d} y={f.h - f.h / 8} h={f.h / 4 - 0.02} />;
      })}
    </group>
  );
}

function Drawer({ id, x, z, w, d, y, h }: { id: string; x: number; z: number; w: number; d: number; y: number; h: number }) {
  const open = useObj(id) > 0;
  const ref = useRef<THREE.Group>(null!);
  useFrame((_, dt) => {
    ref.current.position.z = damp(ref.current.position.z, open ? 0.38 : 0, 8, dt);
  });
  return (
    <group position={[x, y, z]}>
      <group ref={ref}>
        <mesh material={MATS.plasticWhite} position={[0, 0, d / 2 - 0.01]}>
          <boxGeometry args={[w - 0.03, h, 0.02]} />
        </mesh>
        <mesh material={MATS.blackMetal} position={[0, 0.06, d / 2 + 0.005]}>
          <boxGeometry args={[0.16, 0.025, 0.02]} />
        </mesh>
        <mesh material={MATS.whiteMetal} position={[0, -0.02, 0]}>
          <boxGeometry args={[w - 0.06, h - 0.06, d - 0.06]} />
        </mesh>
        {[-0.12, -0.04, 0.04, 0.12].map((o) => (
          <mesh key={o} material={o > 0 ? MATS.bookC : MATS.bookB} position={[0, 0.04, o]}>
            <boxGeometry args={[w - 0.12, 0.2, 0.012]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function useTimedActive(id: string, ms = 6000) {
  const t = useObj(id);
  return () => t > 0 && serverNow() - t < ms;
}

function CoffeeMachine() {
  const f = FURNITURE.find((x) => x.type === 'coffeeMachine')!;
  const active = useTimedActive('coffee');
  const steam = useRef<THREE.Group>(null!);
  const light = useRef<THREE.MeshBasicMaterial>(null!);
  const t = useObj('coffee');
  useEffect(() => {
    if (t && serverNow() - t < 1500 && Math.hypot(runtime.local.pos.x - f.x, runtime.local.pos.z - f.z) < 8) sfx.coffee();
  }, [t, f.x, f.z]);
  useFrame(({ clock }) => {
    const on = active();
    steam.current.visible = on;
    light.current.color.set(on ? '#4ade80' : '#f97316');
    if (on)
      steam.current.children.forEach((c, i) => {
        const k = (clock.elapsedTime * 0.8 + i * 0.25) % 1;
        c.position.y = 0.05 + k * 0.35;
        c.scale.setScalar(0.5 + k);
        ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - k);
      });
  });
  return (
    <group position={[f.x, f.y ?? 0.9, f.z]} rotation={[0, f.rotY, 0]}>
      <mesh material={MATS.black} position={[0, 0.21, -0.03]} castShadow>
        <boxGeometry args={[f.w, 0.42, f.d - 0.06]} />
      </mesh>
      <mesh material={MATS.steel} position={[0, 0.36, 0.13]}>
        <boxGeometry args={[f.w - 0.04, 0.1, 0.08]} />
      </mesh>
      <mesh material={MATS.steel} position={[0, 0.03, 0.12]}>
        <boxGeometry args={[f.w - 0.06, 0.02, 0.12]} />
      </mesh>
      <mesh material={MATS.ceramicWhite} position={[0, 0.08, 0.12]}>
        <cylinderGeometry args={[0.035, 0.03, 0.08, 12]} />
      </mesh>
      <mesh position={[0.1, 0.33, 0.175]}>
        <sphereGeometry args={[0.012, 8, 6]} />
        <meshBasicMaterial ref={light} color="#f97316" toneMapped={false} />
      </mesh>
      <group ref={steam} position={[0, 0.1, 0.12]}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.03, 8, 6]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.3} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function WaterStream() {
  const f = FURNITURE.find((x) => x.type === 'waterDispenser')!;
  const active = useTimedActive('water', 4000);
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(() => {
    ref.current.visible = active();
  });
  return (
    <mesh ref={ref} material={MATS.waterBlue} position={[f.x + 0.19, 0.62, f.z - 0.05]}>
      <cylinderGeometry args={[0.008, 0.008, 0.18, 6]} />
    </mesh>
  );
}

function PrinterPaper() {
  const f = FURNITURE.find((x) => x.type === 'printer')!;
  const t = useObj('printer');
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(() => {
    const k = t ? Math.min(1, (serverNow() - t) / 3000) : 1;
    const on = t > 0 && serverNow() - t < 9000;
    ref.current.visible = on;
    ref.current.position.z = f.z + 0.1 + k * 0.22;
  });
  return (
    <mesh ref={ref} material={MATS.paper} position={[f.x, 0.585, f.z]}>
      <boxGeometry args={[0.21, 0.004, 0.297]} />
    </mesh>
  );
}

function DirectorLamp() {
  const f = FURNITURE.find((x) => x.type === 'floorLamp')!;
  const on = useObj('lamp-director') > 0;
  return (
    <group position={[f.x, 0, f.z]}>
      <mesh position={[0, 1.62, 0]} material={on ? MATS.ledWarm : MATS.fabricGrey}>
        <cylinderGeometry args={[0.16, 0.22, 0.28, 18, 1, true]} />
      </mesh>
      {on && <pointLight position={[0, 1.5, 0.2]} intensity={2.5} distance={5.5} color="#ffcf8a" />}
    </group>
  );
}

// ───────────────────────────── screens ─────────────────────────────
function useCanvasTexture(w: number, h: number) {
  return useMemo(() => {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return { cv, ctx: cv.getContext('2d')!, tex };
  }, [w, h]);
}

const FONT = '"Be Vietnam Pro", "Segoe UI", system-ui, sans-serif';

function drawSlide(c: CanvasRenderingContext2D, W: number, H: number, slide: number, online: number, working: number) {
  const g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#14161a');
  g.addColorStop(1, '#262a33');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  c.fillStyle = '#F7941D';
  c.fillRect(0, 0, W, 14);
  c.fillStyle = '#ffffff';
  c.textAlign = 'left';
  c.textBaseline = 'top';
  c.font = `800 30px ${FONT}`;
  c.fillStyle = '#F7941D';
  c.fillText('XBRAIN', 50, 40);
  c.fillStyle = 'rgba(255,255,255,0.5)';
  c.font = `500 22px ${FONT}`;
  c.fillText(`Slide ${slide}/4`, W - 160, 44);
  c.fillStyle = '#ffffff';
  const title = ['Weekly Sync — Đà Nẵng', 'Live Office Status', 'Q4 Roadmap', 'Thank you!'][slide - 1];
  c.font = `800 64px ${FONT}`;
  c.fillText(title, 50, 110);
  c.font = `500 32px ${FONT}`;
  const lines: string[][] = [
    ['• Sprint review & demo', '• Virtual Office rollout to all teams', '• Hiring update: 5 new interns', '• Q&A'],
    [`• Online now: ${online}`, `• Working at desks: ${working}`, `• Free desks: ${TOTAL_DESKS - working}`, '• Meeting room: in use'],
    ['• Launch XBrain Virtual Office v1', '• Voice & collaboration upgrades', '• Analytics: weekly / monthly reports', '• Mobile companion app'],
    ['Connect • Work • Collaborate', '', 'Press [F] at the TV for the next slide'],
  ];
  lines[slide - 1].forEach((l, i) => {
    c.fillStyle = i === 0 && slide === 4 ? '#F7941D' : 'rgba(255,255,255,0.88)';
    c.fillText(l, 60, 220 + i * 56);
  });
}

function MeetingTV() {
  const f = FURNITURE.find((x) => x.type === 'tv')!;
  const state = useObj('tv-meeting');
  const { cv, ctx, tex } = useCanvasTexture(1024, 576);
  const players = useWorld((s) => s.players);
  const online = Object.keys(players).length;
  const working = Object.values(players).filter((p) => p.working).length;
  useEffect(() => {
    if (state > 0) {
      drawSlide(ctx, cv.width, cv.height, state, online, working);
      tex.needsUpdate = true;
    }
  }, [state, online, working, cv, ctx, tex]);
  return (
    <group position={[f.x, f.y ?? 1.5, f.z]} rotation={[0, f.rotY, 0]}>
      <mesh material={MATS.black} castShadow>
        <boxGeometry args={[f.w + 0.04, f.h + 0.04, 0.05]} />
      </mesh>
      <mesh position={[0, 0, 0.027]}>
        <planeGeometry args={[f.w, f.h]} />
        {state > 0 ? <meshBasicMaterial map={tex} toneMapped={false} /> : <meshStandardMaterial color="#050506" roughness={0.15} metalness={0.3} />}
      </mesh>
      {state > 0 && <pointLight position={[0, 0, 0.6]} intensity={0.8} distance={3} color="#9ab8ff" />}
    </group>
  );
}

function Whiteboard() {
  const f = FURNITURE.find((x) => x.type === 'whiteboard')!;
  const text = useWorld((s) => s.boards['wb-meeting'] ?? '');
  const { cv, ctx, tex } = useCanvasTexture(1024, 512);
  useEffect(() => {
    const c = ctx;
    c.fillStyle = '#fbfbfa';
    c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = '#1e3a8a';
    c.textAlign = 'left';
    c.textBaseline = 'top';
    const lines = text.split('\n').flatMap((l) => {
      const out: string[] = [];
      let cur = '';
      for (const w of l.split(' ')) {
        c.font = `600 34px "Segoe Print", "Comic Sans MS", ${FONT}`;
        if (c.measureText(`${cur} ${w}`).width > cv.width - 80 && cur) {
          out.push(cur);
          cur = w;
        } else cur = cur ? `${cur} ${w}` : w;
      }
      out.push(cur);
      return out;
    });
    lines.slice(0, 11).forEach((l, i) => {
      c.fillStyle = i === 0 ? '#c2410c' : '#1e3a8a';
      c.font = i === 0 ? `700 40px "Segoe Print", "Comic Sans MS", ${FONT}` : `600 32px "Segoe Print", "Comic Sans MS", ${FONT}`;
      c.fillText(l, 40, 28 + i * 42);
    });
    tex.needsUpdate = true;
  }, [text, cv, ctx, tex]);
  return (
    <group position={[f.x, f.y ?? 1.4, f.z]} rotation={[0, f.rotY, 0]}>
      <mesh material={MATS.steel}>
        <boxGeometry args={[f.w + 0.05, f.h + 0.05, 0.03]} />
      </mesh>
      <mesh position={[0, 0, 0.017]}>
        <planeGeometry args={[f.w, f.h]} />
        <meshStandardMaterial map={tex} roughness={0.3} />
      </mesh>
      <mesh material={MATS.steel} position={[0, -f.h / 2 - 0.04, 0.05]}>
        <boxGeometry args={[f.w * 0.6, 0.02, 0.08]} />
      </mesh>
      {['#ef4444', '#1d4ed8', '#111'].map((c, i) => (
        <mesh key={c} position={[-0.3 + i * 0.12, -f.h / 2 - 0.02, 0.06]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.01, 0.01, 0.1, 6]} />
          <meshStandardMaterial color={c} />
        </mesh>
      ))}
    </group>
  );
}

function StatusScreens() {
  const status = FURNITURE.find((x) => x.type === 'statusScreen')!;
  const welcome = FURNITURE.find((x) => x.type === 'welcomeScreen')!;
  const s = useCanvasTexture(1024, 576);
  const w = useCanvasTexture(1024, 576);
  const officeName = useWorld((st) => st.officeName);
  useEffect(() => {
    const draw = () => {
      const { players, seats, capacity } = useWorld.getState();
      const list = Object.values(players);
      const working = list.filter((p) => p.working);
      const desksUsed = Object.keys(seats).filter((id) => SEAT_BY_ID[id]?.kind === 'desk').length;
      // Workspace status board
      let c = s.ctx;
      c.fillStyle = '#0f1115';
      c.fillRect(0, 0, 1024, 576);
      c.fillStyle = '#F7941D';
      c.fillRect(0, 0, 1024, 10);
      c.font = `800 40px ${FONT}`;
      c.fillStyle = '#ffffff';
      c.textAlign = 'left';
      c.textBaseline = 'top';
      c.fillText('XBRAIN OFFICE STATUS', 40, 34);
      c.font = `600 26px "JetBrains Mono", monospace`;
      c.fillStyle = 'rgba(255,255,255,0.6)';
      c.textAlign = 'right';
      c.fillText(new Date().toLocaleTimeString('vi-VN'), 984, 44);
      const stats: Array<[string, string, string]> = [
        ['ONLINE', `${list.length}/${capacity}`, '#4ade80'],
        ['WORKING', String(working.length), '#fbbf24'],
        ['FREE DESKS', String(TOTAL_DESKS - desksUsed), '#60a5fa'],
      ];
      stats.forEach(([label, val, col], i) => {
        const x = 40 + i * 325;
        c.fillStyle = 'rgba(255,255,255,0.06)';
        c.fillRect(x, 110, 300, 130);
        c.textAlign = 'left';
        c.fillStyle = 'rgba(255,255,255,0.6)';
        c.font = `700 22px ${FONT}`;
        c.fillText(label, x + 20, 126);
        c.fillStyle = col;
        c.font = `800 64px ${FONT}`;
        c.fillText(val, x + 20, 158);
      });
      c.fillStyle = 'rgba(255,255,255,0.75)';
      c.font = `700 24px ${FONT}`;
      c.fillText('Working now', 40, 270);
      working
        .sort((a, b) => workElapsed(b) - workElapsed(a))
        .slice(0, 6)
        .forEach((p, i) => {
          const y = 310 + i * 42;
          c.fillStyle = '#ffffff';
          c.font = `600 26px ${FONT}`;
          c.textAlign = 'left';
          c.fillText(`${p.name}`.slice(0, 26), 40, y);
          c.fillStyle = 'rgba(255,255,255,0.5)';
          c.fillText(SEAT_BY_ID[p.seatId]?.label ?? '', 520, y);
          c.textAlign = 'right';
          c.fillStyle = '#fbbf24';
          c.font = `700 26px "JetBrains Mono", monospace`;
          c.fillText(formatHMS(workElapsed(p)), 984, y);
        });
      if (!working.length) {
        c.fillStyle = 'rgba(255,255,255,0.4)';
        c.font = `500 24px ${FONT}`;
        c.textAlign = 'left';
        c.fillText('No one is working yet — grab a desk and press E!', 40, 312);
      }
      s.tex.needsUpdate = true;

      // Lobby welcome screen
      c = w.ctx;
      const g = c.createLinearGradient(0, 0, 1024, 576);
      g.addColorStop(0, '#E5622A');
      g.addColorStop(1, '#F9B33F');
      c.fillStyle = g;
      c.fillRect(0, 0, 1024, 576);
      c.fillStyle = 'rgba(0,0,0,0.18)';
      c.fillRect(0, 380, 1024, 196);
      c.fillStyle = '#ffffff';
      c.textAlign = 'center';
      c.font = `500 34px ${FONT}`;
      c.fillText('WELCOME TO', 512, 70);
      c.font = `800 74px ${FONT}`;
      c.fillText(officeName.toUpperCase(), 512, 120);
      c.font = `600 30px ${FONT}`;
      c.fillText('Connect • Work • Collaborate', 512, 220);
      c.font = `700 72px "JetBrains Mono", monospace`;
      c.fillText(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }), 512, 400);
      c.font = `600 28px ${FONT}`;
      c.fillText(`${list.length} people online · ${working.length} working`, 512, 495);
      w.tex.needsUpdate = true;
    };
    draw();
    const id = setInterval(draw, 1000);
    return () => clearInterval(id);
  }, [s, w, officeName]);
  return (
    <group>
      {[
        { f: status, tex: s.tex },
        { f: welcome, tex: w.tex },
      ].map(({ f, tex }) => (
        <group key={f.id} position={[f.x, f.y ?? 1.6, f.z]} rotation={[0, f.rotY, 0]}>
          <mesh material={MATS.black}>
            <boxGeometry args={[f.w + 0.05, f.h + 0.05, 0.05]} />
          </mesh>
          <mesh position={[0, 0, 0.027]}>
            <planeGeometry args={[f.w, f.h]} />
            <meshBasicMaterial map={tex} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Instanced monitor screens: lit when the seat in front of them is occupied. */
function MonitorScreens() {
  const seats = useWorld((s) => s.seats);
  const entries = useMemo(() => {
    const list: Array<{ seatId: string; pos: THREE.Vector3; rotY: number; w: number; h: number }> = [];
    const place = (cx: number, cz: number, rotY: number, lx: number, ly: number, lz: number) => {
      const v = new THREE.Vector3(lx, ly, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
      return new THREE.Vector3(cx + v.x, v.y, cz + v.z);
    };
    for (const d of DESKS) list.push({ seatId: d.seatId, pos: place(d.x, d.z, d.rotY, 0, 1.08, 0.18 - 0.019), rotY: d.rotY + Math.PI, w: 0.56, h: 0.32 });
    const rec = FURNITURE.find((f) => f.type === 'receptionDesk')!;
    list.push({ seatId: 'S-R-1', pos: place(rec.x, rec.z, rec.rotY, -0.8, 1.05, -0.02 - 0.017), rotY: rec.rotY + Math.PI, w: 0.52, h: 0.29 });
    list.push({ seatId: 'S-R-2', pos: place(rec.x, rec.z, rec.rotY, 0.8, 1.05, -0.02 - 0.017), rotY: rec.rotY + Math.PI, w: 0.52, h: 0.29 });
    const dir = FURNITURE.find((f) => f.type === 'directorDesk')!;
    list.push({ seatId: 'S-DIR', pos: place(dir.x, dir.z, dir.rotY, 0.2, 1.1, 0.13 - 0.019), rotY: dir.rotY + Math.PI, w: 0.66, h: 0.37 });
    return list;
  }, []);
  const mesh = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({ map: monitorTexture(), toneMapped: false });
    const m = new THREE.InstancedMesh(geo, mat, entries.length);
    const o = new THREE.Object3D();
    entries.forEach((e, i) => {
      o.position.copy(e.pos);
      o.rotation.set(0, e.rotY, 0);
      o.scale.set(e.w, e.h, 1);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, new THREE.Color('#0a0a0b'));
    });
    m.instanceMatrix.needsUpdate = true;
    return m;
  }, [entries]);
  useEffect(() => {
    const on = new THREE.Color('#ffffff');
    const off = new THREE.Color('#08090a');
    entries.forEach((e, i) => mesh.setColorAt(i, seats[e.seatId] ? on : off));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [seats, entries, mesh]);
  return <primitive object={mesh} />;
}

export function InteractiveObjects() {
  return (
    <group>
      {DOORS.map((d) => (
        <RoomDoor key={d.id} d={d} />
      ))}
      <EntranceDoors />
      <Fridge />
      <KitchenCabinetDoors />
      <Lockers />
      <FileDrawers />
      <CoffeeMachine />
      <WaterStream />
      <PrinterPaper />
      <DirectorLamp />
      <MeetingTV />
      <Whiteboard />
      <StatusScreens />
      <MonitorScreens />
    </group>
  );
}
