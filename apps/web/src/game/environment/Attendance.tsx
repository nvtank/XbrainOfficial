/**
 * Face-recognition attendance checkpoint (left of the black reception wall) and the
 * live Attendance Dashboard screen. Both render real server data (attendance map,
 * players, seats) into canvas textures.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FURNITURE, SEAT_BY_ID, TOTAL_DESKS, type KioskDisplay } from '@xbrain/shared';
import { useWorld } from '../../stores/world';
import { useGame } from '../../stores/game';
import { MATS } from './materials';
import { serverNow, workElapsed } from '../../services/clock';

const FONT = '"Be Vietnam Pro", "Segoe UI", system-ui, sans-serif';
const fmtTime = (t: number) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

function useCanvas(w: number, h: number) {
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

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// ───────────────────────────── kiosk ─────────────────────────────
function drawKiosk(c: CanvasRenderingContext2D, W: number, H: number, mode: 'idle' | 'scanning' | 'result', k: KioskDisplay | null, t: number) {
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0f1621');
  g.addColorStop(1, '#16202e');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  c.fillStyle = '#F7941D';
  c.fillRect(0, 0, W, 8);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = '#ffffff';
  c.font = `800 30px ${FONT}`;
  c.fillText('XBRAIN FACE ID', W / 2, 46);
  c.font = `600 22px "JetBrains Mono", monospace`;
  c.fillStyle = 'rgba(255,255,255,0.6)';
  c.fillText(new Date().toLocaleTimeString('vi-VN'), W / 2, 82);
  const cx = W / 2;
  const cy = 300;
  if (mode === 'result' && k) {
    c.beginPath();
    c.arc(cx, cy, 120, 0, Math.PI * 2);
    c.fillStyle = k.late ? 'rgba(251,191,36,0.18)' : 'rgba(74,222,128,0.18)';
    c.fill();
    c.lineWidth = 10;
    c.strokeStyle = k.late ? '#fbbf24' : '#4ade80';
    c.stroke();
    c.beginPath();
    c.moveTo(cx - 52, cy + 4);
    c.lineTo(cx - 12, cy + 44);
    c.lineTo(cx + 60, cy - 40);
    c.lineWidth = 16;
    c.lineCap = 'round';
    c.stroke();
    c.fillStyle = '#ffffff';
    c.font = `800 34px ${FONT}`;
    c.fillText(k.already ? 'Already checked in' : 'Check-in successful', cx, 470);
    c.font = `700 40px ${FONT}`;
    c.fillStyle = '#F7941D';
    let name = k.name;
    while (c.measureText(name).width > W - 40 && name.length > 3) name = name.slice(0, -2) + '…';
    c.fillText(name, cx, 528);
    c.font = `700 34px "JetBrains Mono", monospace`;
    c.fillStyle = '#ffffff';
    c.fillText(fmtTime(k.time), cx, 584);
    c.font = `700 26px ${FONT}`;
    c.fillStyle = k.late ? '#fbbf24' : '#4ade80';
    c.fillText(k.late ? 'LATE ARRIVAL' : 'ON TIME', cx, 632);
    return;
  }
  // Face outline guide
  c.strokeStyle = mode === 'scanning' ? '#4fb4ff' : 'rgba(255,255,255,0.45)';
  c.lineWidth = 6;
  c.setLineDash([18, 12]);
  c.beginPath();
  c.ellipse(cx, cy, 110, 140, 0, 0, Math.PI * 2);
  c.stroke();
  c.setLineDash([]);
  // corner brackets
  c.strokeStyle = '#F7941D';
  c.lineWidth = 8;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = cx + sx * 150;
    const y = cy + sy * 175;
    c.beginPath();
    c.moveTo(x, y - sy * 40);
    c.lineTo(x, y);
    c.lineTo(x - sx * 40, y);
    c.stroke();
  }
  if (mode === 'scanning') {
    const y = cy - 150 + ((t * 320) % 300);
    const lg = c.createLinearGradient(0, y - 30, 0, y + 6);
    lg.addColorStop(0, 'rgba(79,180,255,0)');
    lg.addColorStop(1, 'rgba(79,180,255,0.85)');
    c.fillStyle = lg;
    c.fillRect(cx - 150, y - 30, 300, 36);
    c.fillStyle = '#4fb4ff';
    c.font = `700 30px ${FONT}`;
    c.fillText('Scanning face…', cx, 520);
    const dots = Math.floor(t * 4) % 4;
    c.font = `600 24px ${FONT}`;
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.fillText('Hold still' + '.'.repeat(dots), cx, 566);
  } else {
    c.fillStyle = '#ffffff';
    c.font = `700 30px ${FONT}`;
    c.fillText('Look at the camera', cx, 520);
    c.font = `600 24px ${FONT}`;
    c.fillStyle = 'rgba(255,255,255,0.65)';
    c.fillText('Press E to check in · Điểm danh', cx, 566);
  }
}

function Kiosk() {
  const f = FURNITURE.find((x) => x.type === 'kiosk')!;
  const { cv, ctx, tex } = useCanvas(420, 680);
  const ring = useRef<THREE.MeshStandardMaterial>(null!);
  const last = useRef(0);
  useFrame(({ clock }) => {
    const now = clock.elapsedTime;
    const g = useGame.getState().checkin;
    const scanning = g.phase === 'scanning' || g.phase === 'sent';
    let kiosk: KioskDisplay | null = null;
    try {
      kiosk = JSON.parse(useWorld.getState().boards.kiosk ?? 'null');
    } catch {
      kiosk = null;
    }
    const showResult = !scanning && kiosk && serverNow() - kiosk.time < 9000;
    const mode = scanning ? 'scanning' : showResult ? 'result' : 'idle';
    const hz = scanning ? 20 : 2;
    if (now - last.current > 1 / hz) {
      last.current = now;
      drawKiosk(ctx, cv.width, cv.height, mode, kiosk, now);
      tex.needsUpdate = true;
    }
    if (ring.current) {
      ring.current.emissive.set(mode === 'result' ? (kiosk?.late ? '#fbbf24' : '#4ade80') : scanning ? '#4fb4ff' : '#F7941D');
      ring.current.emissiveIntensity = scanning ? 1.5 + Math.sin(now * 10) * 0.8 : 1.4;
    }
  });
  return (
    <group position={[f.x, 0, f.z]} rotation={[0, f.rotY, 0]}>
      <mesh material={MATS.black} position={[0, 0.02, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.04, 0.42]} />
      </mesh>
      <mesh material={MATS.cctvWhite} position={[0, 0.6, -0.02]} castShadow>
        <boxGeometry args={[0.13, 1.16, 0.09]} />
      </mesh>
      <mesh material={MATS.orange} position={[0, 0.6, 0.026]}>
        <boxGeometry args={[0.02, 1.0, 0.004]} />
      </mesh>
      <group position={[0, 1.33, 0.02]} rotation={[-0.18, 0, 0]}>
        <mesh material={MATS.black} castShadow>
          <boxGeometry args={[0.44, 0.66, 0.06]} />
        </mesh>
        <mesh position={[0, -0.02, 0.031]}>
          <planeGeometry args={[0.38, 0.56]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
        {/* Camera bar with IR lenses + status ring */}
        <mesh material={MATS.black} position={[0, 0.31, 0.035]}>
          <boxGeometry args={[0.26, 0.05, 0.02]} />
        </mesh>
        {[-0.07, 0, 0.07].map((x) => (
          <mesh key={x} material={x === 0 ? MATS.lens : MATS.ledRed} position={[x, 0.31, 0.047]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[x === 0 ? 0.014 : 0.006, x === 0 ? 0.014 : 0.006, 0.006, 12]} />
          </mesh>
        ))}
        <mesh position={[0, 0.31, 0.046]}>
          <torusGeometry args={[0.022, 0.004, 6, 20]} />
          <meshStandardMaterial ref={ring} color="#111" emissive="#F7941D" emissiveIntensity={1.4} />
        </mesh>
      </group>
      {/* Floor marker: stand here */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0.45]}>
        <ringGeometry args={[0.26, 0.31, 40]} />
        <meshBasicMaterial color="#F7941D" transparent opacity={0.8} toneMapped={false} />
      </mesh>
    </group>
  );
}

// ───────────────────────────── attendance dashboard ─────────────────────────────
function drawDashboard(c: CanvasRenderingContext2D, W: number, H: number) {
  const { attendance, players, seats, activeWeek, lateAfter } = useWorld.getState();
  const recs = Object.values(attendance).sort((a, b) => b.time - a.time);
  const present = recs.length;
  const late = recs.filter((r) => r.late).length;
  const online = Object.keys(players).length;
  const working = Object.values(players).filter((p) => p.working);
  const desksUsed = Object.keys(seats).filter((id) => SEAT_BY_ID[id]?.kind === 'desk').length;
  const absent = Math.max(0, activeWeek - present);
  const onlineUserIds = new Set(Object.values(players).map((p) => p.userId));

  c.fillStyle = '#0d1117';
  c.fillRect(0, 0, W, H);
  c.fillStyle = '#F7941D';
  c.fillRect(0, 0, W, 10);
  c.textBaseline = 'top';
  c.textAlign = 'left';
  c.fillStyle = '#ffffff';
  c.font = `800 46px ${FONT}`;
  c.fillText('Attendance Dashboard', 44, 34);
  c.font = `500 24px ${FONT}`;
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.fillText(`${new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })} · late after ${hhmm(lateAfter)}`, 46, 92);
  c.textAlign = 'right';
  c.font = `700 40px "JetBrains Mono", monospace`;
  c.fillStyle = '#ffffff';
  c.fillText(new Date().toLocaleTimeString('vi-VN'), W - 44, 40);

  const tiles: Array<[string, string, string]> = [
    ['Present Today', String(present), '#4ade80'],
    ['Working Now', String(working.length), '#fbbf24'],
    ['Online Users', String(online), '#60a5fa'],
    ['Late Arrivals', String(late), '#f97316'],
    ['Absent', String(absent), '#f87171'],
  ];
  const tw = (W - 88 - 4 * 18) / 5;
  tiles.forEach(([label, val, col], i) => {
    const x = 44 + i * (tw + 18);
    roundRect(c, x, 140, tw, 132, 18);
    c.fillStyle = 'rgba(255,255,255,0.06)';
    c.fill();
    c.fillStyle = col;
    c.fillRect(x, 140, 6, 132);
    c.textAlign = 'left';
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.font = `700 22px ${FONT}`;
    c.fillText(label.toUpperCase(), x + 22, 158);
    c.fillStyle = col;
    c.font = `800 62px ${FONT}`;
    c.fillText(val, x + 22, 192);
  });

  // Checked-in records
  c.textAlign = 'left';
  c.fillStyle = '#ffffff';
  c.font = `800 28px ${FONT}`;
  c.fillText('Checked In', 44, 300);
  if (!recs.length) {
    c.fillStyle = 'rgba(255,255,255,0.4)';
    c.font = `500 24px ${FONT}`;
    c.fillText('No check-ins yet today — use the Face ID terminal by the logo wall.', 44, 350);
  }
  recs.slice(0, 8).forEach((r, i) => {
    const y = 346 + i * 44;
    c.fillStyle = i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)';
    c.fillRect(44, y - 6, 700, 40);
    c.fillStyle = onlineUserIds.has(r.userId) ? '#4ade80' : 'rgba(255,255,255,0.3)';
    c.beginPath();
    c.arc(64, y + 14, 7, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ffffff';
    c.font = `600 24px ${FONT}`;
    c.fillText(r.name.slice(0, 22), 84, y + 2);
    c.font = `600 24px "JetBrains Mono", monospace`;
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.fillText(fmtTime(r.time), 440, y + 2);
    roundRect(c, 600, y, 130, 30, 15);
    c.fillStyle = r.late ? 'rgba(249,115,22,0.25)' : 'rgba(74,222,128,0.2)';
    c.fill();
    c.fillStyle = r.late ? '#fb923c' : '#4ade80';
    c.font = `700 18px ${FONT}`;
    c.textAlign = 'center';
    c.fillText(r.late ? 'LATE' : 'ON TIME', 665, y + 6);
    c.textAlign = 'left';
  });

  // Progress indicators
  const bars: Array<[string, number, string]> = [
    ['Attendance rate', activeWeek ? present / activeWeek : present ? 1 : 0, '#4ade80'],
    ['Desk occupancy', desksUsed / TOTAL_DESKS, '#60a5fa'],
    ['Working / online', online ? working.length / online : 0, '#fbbf24'],
    ['Avg. work progress (8h)', working.length ? Math.min(1, working.reduce((s, p) => s + workElapsed(p), 0) / working.length / (8 * 3600_000)) : 0, '#F7941D'],
  ];
  c.fillStyle = '#ffffff';
  c.font = `800 28px ${FONT}`;
  c.fillText('Progress', 790, 300);
  bars.forEach(([label, v, col], i) => {
    const y = 350 + i * 82;
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.font = `600 22px ${FONT}`;
    c.textAlign = 'left';
    c.fillText(label, 790, y);
    c.textAlign = 'right';
    c.fillStyle = col;
    c.font = `800 24px ${FONT}`;
    c.fillText(`${Math.round(v * 100)}%`, W - 44, y);
    roundRect(c, 790, y + 34, W - 834, 18, 9);
    c.fillStyle = 'rgba(255,255,255,0.1)';
    c.fill();
    roundRect(c, 790, y + 34, Math.max(18, (W - 834) * Math.min(1, v)), 18, 9);
    c.fillStyle = col;
    c.fill();
  });
  c.textAlign = 'left';
}

function AttendanceScreen() {
  const f = FURNITURE.find((x) => x.type === 'attendanceScreen')!;
  const { cv, ctx, tex } = useCanvas(1280, 720);
  useEffect(() => {
    const draw = () => {
      drawDashboard(ctx, cv.width, cv.height);
      tex.needsUpdate = true;
    };
    draw();
    const id = setInterval(draw, 1000);
    return () => clearInterval(id);
  }, [cv, ctx, tex]);
  return (
    <group position={[f.x, f.y ?? 2.1, f.z]} rotation={[0, f.rotY, 0]}>
      <mesh material={MATS.black}>
        <boxGeometry args={[f.w + 0.06, f.h + 0.06, 0.06]} />
      </mesh>
      <mesh position={[0, 0, 0.032]}>
        <planeGeometry args={[f.w, f.h]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      <mesh material={MATS.orange} position={[0, -f.h / 2 - 0.045, 0.02]}>
        <boxGeometry args={[f.w * 0.3, 0.012, 0.012]} />
      </mesh>
    </group>
  );
}

export function AttendanceArea() {
  return (
    <group>
      <Kiosk />
      <AttendanceScreen />
    </group>
  );
}
