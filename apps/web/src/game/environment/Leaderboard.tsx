/** "XBrain Hall of Fame" — big LED leaderboard wall of the hardest-working people (live server data). */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FURNITURE, type LeaderboardPeriod } from '@xbrain/shared';
import { useWorld } from '../../stores/world';
import { MATS } from './materials';
import { PERIOD_LABEL, colorFor, fmtHours, initials, rankedLive } from '../leaderboard';

const FONT = '"Be Vietnam Pro", "Segoe UI", system-ui, sans-serif';
const PERIODS: LeaderboardPeriod[] = ['today', 'week', 'month'];

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function avatarDisc(c: CanvasRenderingContext2D, x: number, y: number, r: number, name: string, id: string, ring: string) {
  c.beginPath();
  c.arc(x, y, r + 7, 0, Math.PI * 2);
  c.fillStyle = ring;
  c.fill();
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = colorFor(id);
  c.fill();
  c.fillStyle = '#ffffff';
  c.font = `800 ${Math.round(r * 0.8)}px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(initials(name), x, y + 2);
}

export function drawLeaderboard(c: CanvasRenderingContext2D, W: number, H: number, period: LeaderboardPeriod, t: number) {
  const data = useWorld.getState().leaderboard;
  const rows = rankedLive(data, period);
  const g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0b0f17');
  g.addColorStop(1, '#1a1220');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  // animated glow
  const glow = c.createRadialGradient(W * 0.33, H * 0.55, 20, W * 0.33, H * 0.55, 520);
  glow.addColorStop(0, `rgba(247,148,29,${0.18 + 0.06 * Math.sin(t * 1.5)})`);
  glow.addColorStop(1, 'rgba(247,148,29,0)');
  c.fillStyle = glow;
  c.fillRect(0, 0, W, H);

  // Header
  c.textAlign = 'left';
  c.textBaseline = 'top';
  c.fillStyle = '#F7941D';
  c.font = `900 56px ${FONT}`;
  c.fillText('🏆 XBRAIN HALL OF FAME', 56, 40);
  c.fillStyle = 'rgba(255,255,255,0.65)';
  c.font = `600 28px ${FONT}`;
  c.fillText('Bảng vàng những người chăm chỉ nhất · thời gian làm việc tại bàn', 60, 120);
  // Period tabs
  PERIODS.forEach((p, i) => {
    const x = W - 56 - (PERIODS.length - i) * 210 + 20;
    rr(c, x, 52, 190, 56, 28);
    c.fillStyle = p === period ? '#F7941D' : 'rgba(255,255,255,0.08)';
    c.fill();
    c.fillStyle = p === period ? '#111' : 'rgba(255,255,255,0.7)';
    c.font = `800 24px ${FONT}`;
    c.textAlign = 'center';
    c.fillText(PERIOD_LABEL[p].en, x + 95, 67);
  });

  if (!rows.length) {
    c.textAlign = 'center';
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.font = `700 44px ${FONT}`;
    c.fillText('Chưa có ai trên bảng vàng', W / 2, H / 2 - 30);
    c.font = `500 30px ${FONT}`;
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.fillText('Ngồi vào bàn và bấm E để bắt đầu tính giờ!', W / 2, H / 2 + 30);
    return;
  }

  // Podium: 2nd · 1st · 3rd
  const podium: Array<[number, number, number, string, string]> = [
    [1, 230, 250, '#c0c7d1', '🥈'],
    [0, 520, 330, '#f4c542', '👑'],
    [2, 810, 200, '#cd7f32', '🥉'],
  ];
  const baseY = H - 70;
  for (const [idx, cx, h, col, medal] of podium) {
    const e = rows[idx];
    rr(c, cx - 125, baseY - h, 250, h, 18);
    const pg = c.createLinearGradient(0, baseY - h, 0, baseY);
    pg.addColorStop(0, col);
    pg.addColorStop(1, 'rgba(255,255,255,0.06)');
    c.fillStyle = pg;
    c.globalAlpha = 0.85;
    c.fill();
    c.globalAlpha = 1;
    c.fillStyle = '#111';
    c.font = `900 90px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(idx + 1), cx, baseY - h / 2 + 20);
    if (!e) continue;
    const ay = baseY - h - 190;
    const bob = idx === 0 ? Math.sin(t * 2) * 6 : 0;
    avatarDisc(c, cx, ay + bob, idx === 0 ? 72 : 60, e.name, e.userId, col);
    c.font = `${idx === 0 ? 64 : 50}px ${FONT}`;
    c.fillText(medal, cx + (idx === 0 ? 0 : 52), ay - (idx === 0 ? 100 : 60) + bob);
    c.fillStyle = '#ffffff';
    c.font = `800 ${idx === 0 ? 36 : 30}px ${FONT}`;
    let name = e.name;
    while (c.measureText(name).width > 260 && name.length > 3) name = name.slice(0, -2) + '…';
    c.fillText(name, cx, ay + (idx === 0 ? 110 : 92));
    c.fillStyle = col;
    c.font = `800 ${idx === 0 ? 34 : 28}px "JetBrains Mono", monospace`;
    c.fillText(fmtHours(e.live), cx, ay + (idx === 0 ? 152 : 128));
    if (e.working) {
      c.fillStyle = '#4ade80';
      c.font = `700 20px ${FONT}`;
      c.fillText('● đang làm việc', cx, ay + (idx === 0 ? 186 : 160));
    }
  }

  // Ranks 4–10
  const lx = 1000;
  const top = rows[0]?.live || 1;
  c.textBaseline = 'middle';
  for (let i = 3; i < Math.min(10, rows.length); i++) {
    const e = rows[i];
    const y = 200 + (i - 3) * 92;
    rr(c, lx, y, W - lx - 56, 78, 16);
    c.fillStyle = 'rgba(255,255,255,0.06)';
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.font = `800 32px ${FONT}`;
    c.textAlign = 'center';
    c.fillText(String(i + 1), lx + 40, y + 40);
    avatarDisc(c, lx + 110, y + 39, 26, e.name, e.userId, 'rgba(255,255,255,0.15)');
    c.textAlign = 'left';
    c.fillStyle = '#ffffff';
    c.font = `700 28px ${FONT}`;
    let name = e.name;
    while (c.measureText(name).width > 250 && name.length > 3) name = name.slice(0, -2) + '…';
    c.fillText(name, lx + 152, y + 28);
    rr(c, lx + 152, y + 52, 260, 10, 5);
    c.fillStyle = 'rgba(255,255,255,0.1)';
    c.fill();
    rr(c, lx + 152, y + 52, Math.max(10, 260 * (e.live / top)), 10, 5);
    c.fillStyle = colorFor(e.userId);
    c.fill();
    c.textAlign = 'right';
    c.fillStyle = e.working ? '#4ade80' : '#F7941D';
    c.font = `800 28px "JetBrains Mono", monospace`;
    c.fillText(fmtHours(e.live), W - 80, y + 40);
  }
  if (rows.length <= 3) {
    c.textAlign = 'center';
    c.fillStyle = 'rgba(255,255,255,0.45)';
    c.font = `500 28px ${FONT}`;
    c.fillText('Còn chỗ trên bảng vàng — vào bàn làm việc nào! 💪', 1270, 420);
  }
}

export function LeaderboardWall() {
  const f = FURNITURE.find((x) => x.type === 'leaderboard')!;
  const { cv, ctx, tex } = useMemo(() => {
    const cv = document.createElement('canvas');
    cv.width = 1600;
    cv.height = 900;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return { cv, ctx: cv.getContext('2d')!, tex };
  }, []);
  const strip = useRef<THREE.MeshBasicMaterial>(null!);
  const last = useRef(-1);
  useEffect(() => () => tex.dispose(), [tex]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    // Rotate periods every 10 s; redraw at 4 Hz (live timers + glow animation)
    if (t - last.current > 0.25) {
      last.current = t;
      drawLeaderboard(ctx, cv.width, cv.height, PERIODS[Math.floor(t / 10) % PERIODS.length], t);
      tex.needsUpdate = true;
    }
    if (strip.current) strip.current.color.setHSL(0.08, 1, 0.5 + 0.08 * Math.sin(t * 2));
  });
  return (
    <group position={[f.x, f.y ?? 2.1, f.z]} rotation={[0, f.rotY, 0]}>
      <mesh material={MATS.black} castShadow>
        <boxGeometry args={[f.w + 0.16, f.h + 0.16, 0.1]} />
      </mesh>
      <mesh position={[0, 0, 0.052]}>
        <planeGeometry args={[f.w, f.h]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      {/* Orange LED frame */}
      {[
        [0, f.h / 2 + 0.09, f.w + 0.2, 0.025],
        [0, -f.h / 2 - 0.09, f.w + 0.2, 0.025],
        [f.w / 2 + 0.09, 0, 0.025, f.h + 0.2],
        [-f.w / 2 - 0.09, 0, 0.025, f.h + 0.2],
      ].map(([x, y, w, h], i) => (
        <mesh key={i} position={[x, y, 0.06]}>
          <boxGeometry args={[w, h, 0.02]} />
          <meshBasicMaterial ref={i === 0 ? strip : undefined} color="#F7941D" toneMapped={false} />
        </mesh>
      ))}
      <pointLight position={[0, 0, 1.2]} intensity={1.6} distance={6} color="#ffb766" />
    </group>
  );
}
