/** Posters, wall art and room signage (canvas-textured panels) that make the office feel lived-in. */
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { FURNITURE, type FurnitureDef } from '@xbrain/shared';
import { MATS } from './materials';
import { LOGO_URL } from './Logo3D';

const FONT = '"Be Vietnam Pro", "Segoe UI", system-ui, sans-serif';
let logoImg: HTMLImageElement | null = null;
const logoReady = new Promise<HTMLImageElement | null>((res) => {
  const img = new Image();
  img.onload = () => res((logoImg = img));
  img.onerror = () => res(null);
  img.src = LOGO_URL;
});

function lines(c: CanvasRenderingContext2D, items: string[], x: number, y: number, gap: number) {
  items.forEach((t, i) => c.fillText(t, x, y + i * gap));
}

function drawPoster(c: CanvasRenderingContext2D, W: number, H: number, variant: string) {
  c.textBaseline = 'top';
  c.textAlign = 'left';
  const orangeGrad = () => {
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#E5622A');
    g.addColorStop(1, '#F9B33F');
    return g;
  };
  switch (variant) {
    case 'mission': {
      c.fillStyle = orangeGrad();
      c.fillRect(0, 0, W, H);
      c.fillStyle = 'rgba(255,255,255,0.15)';
      for (let i = 0; i < 6; i++) {
        c.beginPath();
        c.arc(W * (0.2 + 0.15 * i), H * (0.75 + 0.05 * Math.sin(i)), 60 + i * 12, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = '#fff';
      c.font = `800 44px ${FONT}`;
      c.fillText('OUR MISSION', 50, 60);
      c.font = `700 52px ${FONT}`;
      lines(c, ['Build smart', 'software that', 'moves Vietnam', 'forward.'], 50, 150, 64);
      c.font = `500 26px ${FONT}`;
      c.fillText('XBrain · Đà Nẵng', 50, H - 80);
      break;
    }
    case 'values': {
      c.fillStyle = '#14161a';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#F7941D';
      c.fillRect(0, 0, 14, H);
      c.font = `800 44px ${FONT}`;
      c.fillText('XBRAIN VALUES', 50, 60);
      const v: Array<[string, string]> = [['01', 'Connect'], ['02', 'Work smart'], ['03', 'Collaborate'], ['04', 'Own the result'], ['05', 'Learn every day']];
      v.forEach(([n, t], i) => {
        c.fillStyle = '#F7941D';
        c.font = `800 34px "JetBrains Mono", monospace`;
        c.fillText(n, 50, 150 + i * 90);
        c.fillStyle = '#fff';
        c.font = `700 40px ${FONT}`;
        c.fillText(t, 130, 148 + i * 90);
      });
      break;
    }
    case 'mural':
    case 'team': {
      c.fillStyle = variant === 'mural' ? '#ffffff' : '#1d2433';
      c.fillRect(0, 0, W, H);
      if (variant === 'mural') {
        if (logoImg) c.drawImage(logoImg, 60, 50, 420, (420 * logoImg.height) / logoImg.width);
        c.fillStyle = '#14161a';
        c.font = `800 64px ${FONT}`;
        c.fillText('CONNECT · WORK · COLLABORATE', 60, H - 170);
        c.fillStyle = '#F7941D';
        c.fillRect(60, H - 80, W - 120, 14);
      } else {
        const cols = ['#F7941D', '#4fb4ff', '#4ade80', '#f472b6', '#fbbf24', '#a78bfa', '#f97316'];
        for (let i = 0; i < 7; i++) {
          const x = 110 + i * ((W - 220) / 6);
          c.fillStyle = cols[i];
          c.beginPath();
          c.arc(x, H * 0.45, 62, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = 'rgba(0,0,0,0.25)';
          c.beginPath();
          c.ellipse(x, H * 0.45 + 120, 46, 54, 0, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#14161a';
          c.beginPath();
          c.arc(x - 18, H * 0.45, 9, 0, Math.PI * 2);
          c.arc(x + 18, H * 0.45, 9, 0, Math.PI * 2);
          c.fill();
        }
        c.fillStyle = '#fff';
        c.font = `800 60px ${FONT}`;
        c.fillText('TEAM XBRAIN ĐÀ NẴNG', 60, 50);
        c.font = `500 30px ${FONT}`;
        c.fillStyle = 'rgba(255,255,255,0.7)';
        c.fillText('50 desks · one team · endless ideas', 60, H - 70);
      }
      break;
    }
    case 'focus': {
      c.fillStyle = '#2f6b4f';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#fff';
      c.font = `800 72px ${FONT}`;
      c.fillText('FOCUS ZONE', 60, 70);
      c.font = `500 36px ${FONT}`;
      lines(c, ['Keep calls short & quiet', 'Use the meeting room for discussions'], 60, 190, 52);
      break;
    }
    case 'pantry': {
      c.fillStyle = '#1b1b1d';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#F7941D';
      c.font = `800 52px ${FONT}`;
      c.fillText('PANTRY MENU', 50, 50);
      c.fillStyle = '#fff';
      c.font = `600 34px ${FONT}`;
      const m = ['☕  Cà phê sữa đá', '🍵  Trà xanh', '🍊  Fresh fruit', '🍞  Bánh mì & bread', '🍜  Instant noodles', '🥤  Juice & water', '🍪  Snacks'];
      lines(c, m, 50, 150, 70);
      c.font = `500 24px ${FONT}`;
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.fillText('Please wash your cup after use 🙏', 50, H - 70);
      break;
    }
    case 'art': {
      const g = c.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#0f2232');
      g.addColorStop(1, '#2b3f57');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
      const blobs: Array<[number, number, number, string]> = [[0.25, 0.4, 0.28, 'rgba(224,184,90,0.85)'], [0.62, 0.55, 0.22, 'rgba(247,148,29,0.75)'], [0.8, 0.3, 0.14, 'rgba(255,255,255,0.65)'], [0.45, 0.75, 0.18, 'rgba(79,180,255,0.5)']];
      for (const [x, y, r, col] of blobs) {
        c.fillStyle = col;
        c.beginPath();
        c.arc(W * x, H * y, H * r, 0, Math.PI * 2);
        c.fill();
      }
      c.strokeStyle = 'rgba(224,184,90,0.9)';
      c.lineWidth = 6;
      c.beginPath();
      c.moveTo(0, H * 0.7);
      c.bezierCurveTo(W * 0.3, H * 0.4, W * 0.6, H * 0.95, W, H * 0.55);
      c.stroke();
      break;
    }
  }
}

function drawSign(c: CanvasRenderingContext2D, W: number, H: number, variant: string) {
  const text: Record<string, [string, string]> = {
    checkin: ['FACE ID CHECK-IN', 'ĐIỂM DANH KHUÔN MẶT'],
    meeting: ['MEETING ROOM', 'PHÒNG HỌP'],
    pantry: ['PANTRY', 'PHÒNG BẾP'],
    director: ['DIRECTOR', 'PHÒNG GIÁM ĐỐC'],
  };
  const [a, b] = text[variant] ?? [variant.toUpperCase(), ''];
  c.fillStyle = '#121418';
  c.fillRect(0, 0, W, H);
  c.fillStyle = '#F7941D';
  c.fillRect(0, 0, 12, H);
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillStyle = '#ffffff';
  c.font = `800 ${Math.round(H * 0.36)}px ${FONT}`;
  c.fillText(a, 40, H * 0.38);
  c.fillStyle = 'rgba(255,255,255,0.6)';
  c.font = `600 ${Math.round(H * 0.2)}px ${FONT}`;
  c.fillText(b, 40, H * 0.76);
}

function Panel({ f }: { f: FurnitureDef }) {
  const [ver, setVer] = useState(0);
  useEffect(() => {
    if (f.variant === 'mural') void logoReady.then(() => setVer(1));
  }, [f.variant]);
  const tex = useMemo(() => {
    const px = f.type === 'sign' ? 260 : 320;
    const cv = document.createElement('canvas');
    cv.width = Math.round(f.w * px);
    cv.height = Math.round(f.h * px);
    const c = cv.getContext('2d')!;
    if (f.type === 'sign') drawSign(c, cv.width, cv.height, f.variant ?? '');
    else drawPoster(c, cv.width, cv.height, f.variant ?? '');
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [f, ver]);
  const frameMat = f.variant === 'art' ? MATS.gold : MATS.black;
  return (
    <group position={[f.x, f.y ?? 1.7, f.z]} rotation={[0, f.rotY, 0]}>
      <mesh material={frameMat}>
        <boxGeometry args={[f.w + (f.type === 'sign' ? 0.02 : 0.06), f.h + (f.type === 'sign' ? 0.02 : 0.06), 0.03]} />
      </mesh>
      <mesh position={[0, 0, 0.017]}>
        <planeGeometry args={[f.w, f.h]} />
        <meshStandardMaterial map={tex} roughness={0.55} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={f.type === 'sign' ? 0.35 : 0.08} />
      </mesh>
    </group>
  );
}

export function Decor() {
  return (
    <group>
      {FURNITURE.filter((f) => f.type === 'poster' || f.type === 'sign').map((f) => (
        <Panel key={f.id} f={f} />
      ))}
    </group>
  );
}
