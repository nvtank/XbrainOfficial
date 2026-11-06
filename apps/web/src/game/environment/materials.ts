/** Shared materials & procedural textures (created once, reused everywhere → fewer shader programs / state changes). */
import * as THREE from 'three';

const std = (color: string, roughness = 0.8, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

export const MATS = {
  wall: std('#f1f0ec', 0.92),
  wallBlack: std('#15171b', 0.5, 0.1),
  facade: std('#2c3036', 0.65, 0.2),
  facadeWood: std('#a8743f', 0.6),
  corridorWall: std('#d9d5cd', 0.9),
  ceiling: std('#1b1d20', 0.95),
  ceilingWhite: std('#e9e8e4', 0.95),
  duct: std('#2b2e33', 0.55, 0.5),
  pipeRed: std('#b4302a', 0.5, 0.2),
  led: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fffaf0', emissiveIntensity: 1.6, roughness: 1 }),
  ledWarm: new THREE.MeshStandardMaterial({ color: '#ffe9c4', emissive: '#ffd59a', emissiveIntensity: 2.0, roughness: 1 }),
  woodDesk: std('#dcc6a0', 0.58),
  woodWarm: std('#b98a5a', 0.55),
  woodDark: std('#5a3c27', 0.5),
  whiteMetal: std('#ececea', 0.42, 0.35),
  blackMetal: std('#1d1f23', 0.45, 0.55),
  steel: std('#a9adb3', 0.28, 0.85),
  plastic: std('#222428', 0.5),
  plasticWhite: std('#f4f4f2', 0.4),
  chairMesh: std('#1f2125', 0.92),
  fabricGrey: std('#6d7178', 0.96),
  fabricDark: std('#34373d', 0.96),
  fabricBlue: std('#2f4b6e', 0.96),
  leather: std('#4a3326', 0.45),
  leatherBlack: std('#1c1c1e', 0.42),
  plant: std('#3f7d3a', 0.85),
  plantDark: std('#2a5a29', 0.85),
  plantLight: std('#5f9d4c', 0.85),
  pot: std('#ebe8e1', 0.35),
  potDark: std('#2a2a2c', 0.45),
  soil: std('#3b2a1f', 1),
  kitchenRed: std('#b0392c', 0.45),
  counterTop: std('#efefeb', 0.25),
  mullion: std('#3a3e44', 0.4, 0.7),
  screenOff: std('#0b0c0e', 0.2, 0.3),
  paper: std('#f7f7f2', 0.9),
  bookA: std('#b7392c', 0.8),
  bookB: std('#2d5f8b', 0.8),
  bookC: std('#f7941d', 0.8),
  bookD: std('#e9e4d8', 0.8),
  bookE: std('#2f6b4f', 0.8),
  orange: std('#f7941d', 0.45),
  rug: std('#8a8072', 1),
  elevator: std('#b9bdc3', 0.22, 0.9),
  fanOrange: std('#f26a1f', 0.45),
  waterBlue: std('#7fc3f0', 0.15, 0, { transparent: true, opacity: 0.85 }),
  whiteboard: std('#fbfbfa', 0.25),
  ceramicWhite: std('#fafafa', 0.3),
  black: std('#111214', 0.6),
};
export type MatKey = keyof typeof MATS;

export const GLASS = new THREE.MeshStandardMaterial({
  color: '#bcd6e6',
  roughness: 0.05,
  metalness: 0.15,
  transparent: true,
  opacity: 0.16,
  depthWrite: false,
  side: THREE.DoubleSide,
});
export const FROSTED = new THREE.MeshStandardMaterial({
  color: '#f4f7f9',
  roughness: 0.6,
  transparent: true,
  opacity: 0.62,
  depthWrite: false,
  side: THREE.DoubleSide,
});

// ───────────────────────────── procedural textures ─────────────────────────────
function canvasTex(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void, repeat = true) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  draw(ctx, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

const rnd = (() => {
  let s = 1234567;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
})();

/** Texture sizes in meters (one texture repeat). */
export const FLOOR_TEX_SIZE = { tile: 2.4, carpet: 2, wood: 2.4, kitchenTile: 1.2, meetingCarpet: 2, stone: 2.4 } as const;

let floorCache: Record<string, THREE.Texture> | null = null;
export function floorTextures() {
  if (floorCache) return floorCache;
  const tile = canvasTex(512, (c, s) => {
    c.fillStyle = '#d6d5d0';
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 4000; i++) {
      c.fillStyle = `rgba(${rnd() > 0.5 ? 255 : 0},${rnd() > 0.5 ? 255 : 0},255,${rnd() * 0.035})`;
      c.fillRect(rnd() * s, rnd() * s, 2, 2);
    }
    c.strokeStyle = 'rgba(120,118,112,0.55)';
    c.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      c.beginPath();
      c.moveTo((i * s) / 4, 0);
      c.lineTo((i * s) / 4, s);
      c.moveTo(0, (i * s) / 4);
      c.lineTo(s, (i * s) / 4);
      c.stroke();
    }
  });
  const carpet = canvasTex(512, (c, s) => {
    const n = 4;
    const cs = s / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const shade = 82 + ((i + j) % 2) * 8 + rnd() * 4;
        c.fillStyle = `rgb(${shade},${shade + 3},${shade + 7})`;
        c.fillRect(i * cs, j * cs, cs, cs);
        c.strokeStyle = 'rgba(255,255,255,0.04)';
        for (let k = 0; k < 14; k++) {
          c.beginPath();
          if ((i + j) % 2) {
            c.moveTo(i * cs + (k * cs) / 14, j * cs);
            c.lineTo(i * cs + (k * cs) / 14, (j + 1) * cs);
          } else {
            c.moveTo(i * cs, j * cs + (k * cs) / 14);
            c.lineTo((i + 1) * cs, j * cs + (k * cs) / 14);
          }
          c.stroke();
        }
      }
    for (let i = 0; i < 9000; i++) {
      const v = rnd() * 40;
      c.fillStyle = `rgba(${v},${v},${v + 10},0.18)`;
      c.fillRect(rnd() * s, rnd() * s, 1.5, 1.5);
    }
  });
  const wood = canvasTex(512, (c, s) => {
    const planks = 12;
    const pw = s / planks;
    for (let i = 0; i < planks; i++) {
      const base = 140 + rnd() * 30;
      c.fillStyle = `rgb(${base},${base * 0.68},${base * 0.45})`;
      c.fillRect(i * pw, 0, pw, s);
      for (let k = 0; k < 40; k++) {
        c.strokeStyle = `rgba(60,35,20,${0.05 + rnd() * 0.08})`;
        c.beginPath();
        const x = i * pw + rnd() * pw;
        c.moveTo(x, 0);
        c.bezierCurveTo(x + rnd() * 6 - 3, s * 0.3, x + rnd() * 6 - 3, s * 0.6, x, s);
        c.stroke();
      }
      c.fillStyle = 'rgba(40,25,15,0.5)';
      c.fillRect(i * pw, 0, 1.5, s);
      const cut = rnd() * s;
      c.fillRect(i * pw, cut, pw, 1.5);
    }
  });
  const kitchenTile = canvasTex(256, (c, s) => {
    c.fillStyle = '#e4e1da';
    c.fillRect(0, 0, s, s);
    c.fillStyle = '#d3cfc6';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) c.fillRect((i * s) / 4, (j * s) / 4, s / 4, s / 4);
    c.strokeStyle = 'rgba(150,145,138,0.7)';
    c.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      c.beginPath();
      c.moveTo((i * s) / 4, 0);
      c.lineTo((i * s) / 4, s);
      c.moveTo(0, (i * s) / 4);
      c.lineTo(s, (i * s) / 4);
      c.stroke();
    }
  });
  const meetingCarpet = canvasTex(256, (c, s) => {
    c.fillStyle = '#4a5566';
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 6000; i++) {
      const v = rnd() * 50;
      c.fillStyle = `rgba(${v},${v + 10},${v + 25},0.2)`;
      c.fillRect(rnd() * s, rnd() * s, 1.5, 1.5);
    }
  });
  const stone = canvasTex(512, (c, s) => {
    c.fillStyle = '#c9c4ba';
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++) {
        const v = 195 + rnd() * 15;
        c.fillStyle = `rgb(${v},${v - 4},${v - 12})`;
        c.fillRect((i * s) / 2 + 2, (j * s) / 2 + 2, s / 2 - 4, s / 2 - 4);
      }
    for (let i = 0; i < 300; i++) {
      c.strokeStyle = `rgba(150,140,130,${rnd() * 0.15})`;
      c.beginPath();
      const x = rnd() * s;
      const y = rnd() * s;
      c.moveTo(x, y);
      c.lineTo(x + rnd() * 40 - 20, y + rnd() * 40 - 20);
      c.stroke();
    }
  });
  floorCache = { tile, carpet, wood, kitchenTile, meetingCarpet, stone };
  return floorCache;
}

/** Building windows texture for the city (also used as emissive map at night). */
let cityTex: { map: THREE.Texture; emissive: THREE.Texture } | null = null;
export function cityTextures() {
  if (cityTex) return cityTex;
  const draw = (lit: boolean) => (c: CanvasRenderingContext2D, s: number) => {
    c.fillStyle = lit ? '#000' : '#9aa4ad';
    c.fillRect(0, 0, s, s);
    const cols = 8;
    const rows = 16;
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const on = rnd() > 0.45;
        c.fillStyle = lit ? (on ? `rgba(255,${200 + rnd() * 40},${120 + rnd() * 60},1)` : '#000') : `rgb(${60 + rnd() * 30},${80 + rnd() * 30},${100 + rnd() * 30})`;
        c.fillRect((i * s) / cols + 3, (j * s) / rows + 3, s / cols - 6, s / rows - 6);
      }
  };
  cityTex = { map: canvasTex(256, draw(false)), emissive: canvasTex(256, draw(true)) };
  return cityTex;
}

/** Generic "desktop UI" texture for monitors. */
let screenTex: THREE.Texture | null = null;
export function monitorTexture() {
  if (screenTex) return screenTex;
  screenTex = canvasTex(
    256,
    (c, s) => {
      const g = c.createLinearGradient(0, 0, s, s);
      g.addColorStop(0, '#1d2a3f');
      g.addColorStop(1, '#0f1622');
      c.fillStyle = g;
      c.fillRect(0, 0, s, s);
      c.fillStyle = '#f7941d';
      c.fillRect(0, 0, s, 16);
      c.fillStyle = '#2b3a52';
      c.fillRect(8, 26, s * 0.28, s - 40);
      for (let i = 0; i < 9; i++) {
        c.fillStyle = i % 3 === 0 ? '#7dd3fc' : i % 3 === 1 ? '#e2e8f0' : '#94a3b8';
        c.fillRect(s * 0.34, 32 + i * 22, s * (0.3 + rnd() * 0.5), 8);
      }
      c.fillStyle = '#334155';
      c.fillRect(s * 0.34, s - 46, s * 0.6, 30);
    },
    false,
  );
  return screenTex;
}
