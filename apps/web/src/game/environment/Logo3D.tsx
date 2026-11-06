/**
 * 3D XBrain logo signs.
 * The official logo image is traced into vector contours (marching squares on a
 * "logo-ness" field), extruded with a bevel, and the front cap is UV-mapped back
 * onto the image so the original colors/gradient are preserved exactly.
 * Replace the logo by setting VITE_LOGO_URL (PNG/SVG/WebP → traced, .glb → used as-is).
 */
import { Suspense, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { FURNITURE, type FurnitureDef } from '@xbrain/shared';

export const LOGO_URL: string = (import.meta.env.VITE_LOGO_URL as string) || '/assets/xbrain-logo.webp';

interface TracedLogo {
  geometry: THREE.ExtrudeGeometry;
  texture: THREE.Texture;
  width: number;
  height: number;
}

type Pt = [number, number];

function traceContours(field: Float32Array, W: number, H: number, t = 0.5): Pt[][] {
  const v = (i: number, j: number) => field[j * W + i];
  const pts = new Map<string, Pt>();
  const segs: Array<[string, string]> = [];
  const lerpPt = (x0: number, y0: number, a: number, x1: number, y1: number, b: number): Pt => {
    const k = Math.abs(b - a) < 1e-6 ? 0.5 : (t - a) / (b - a);
    return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k];
  };
  for (let j = 0; j < H - 1; j++) {
    for (let i = 0; i < W - 1; i++) {
      const tl = v(i, j);
      const tr = v(i + 1, j);
      const br = v(i + 1, j + 1);
      const bl = v(i, j + 1);
      const c = (tl > t ? 8 : 0) | (tr > t ? 4 : 0) | (br > t ? 2 : 0) | (bl > t ? 1 : 0);
      if (c === 0 || c === 15) continue;
      const T = `h${i},${j}`;
      const R = `v${i + 1},${j}`;
      const B = `h${i},${j + 1}`;
      const L = `v${i},${j}`;
      const need = (k: string) => {
        if (pts.has(k)) return;
        if (k === T) pts.set(k, lerpPt(i, j, tl, i + 1, j, tr));
        else if (k === R) pts.set(k, lerpPt(i + 1, j, tr, i + 1, j + 1, br));
        else if (k === B) pts.set(k, lerpPt(i, j + 1, bl, i + 1, j + 1, br));
        else pts.set(k, lerpPt(i, j, tl, i, j + 1, bl));
      };
      const add = (a: string, b: string) => {
        need(a);
        need(b);
        segs.push([a, b]);
      };
      switch (c) {
        case 1: add(L, B); break;
        case 2: add(B, R); break;
        case 3: add(L, R); break;
        case 4: add(T, R); break;
        case 5: add(L, T); add(B, R); break;
        case 6: add(T, B); break;
        case 7: add(L, T); break;
        case 8: add(T, L); break;
        case 9: add(T, B); break;
        case 10: add(T, R); add(L, B); break;
        case 11: add(T, R); break;
        case 12: add(L, R); break;
        case 13: add(B, R); break;
        case 14: add(L, B); break;
      }
    }
  }
  const byKey = new Map<string, number[]>();
  segs.forEach(([a, b], idx) => {
    for (const k of [a, b]) {
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(idx);
    }
  });
  const used = new Uint8Array(segs.length);
  const loops: Pt[][] = [];
  for (let s = 0; s < segs.length; s++) {
    if (used[s]) continue;
    used[s] = 1;
    const start = segs[s][0];
    let cur = segs[s][1];
    const loop: Pt[] = [pts.get(start)!, pts.get(cur)!];
    let guard = 0;
    while (cur !== start && guard++ < 200000) {
      const next = (byKey.get(cur) ?? []).find((k) => !used[k]);
      if (next === undefined) break;
      used[next] = 1;
      const [a, b] = segs[next];
      cur = a === cur ? b : a;
      if (cur !== start) loop.push(pts.get(cur)!);
    }
    if (loop.length >= 6) loops.push(loop);
  }
  return loops;
}

function rdp(points: Pt[], eps: number): Pt[] {
  if (points.length < 3) return points;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  let dmax = 0;
  let idx = 0;
  const len = Math.hypot(bx - ax, by - ay) || 1;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    const d = Math.abs((by - ay) * px - (bx - ax) * py + bx * ay - by * ax) / len;
    if (d > dmax) {
      dmax = d;
      idx = i;
    }
  }
  if (dmax > eps) return [...rdp(points.slice(0, idx + 1), eps).slice(0, -1), ...rdp(points.slice(idx), eps)];
  return [points[0], points[points.length - 1]];
}

/** RDP for closed loops: split at the point farthest from the start, simplify both halves. */
function simplifyClosed(loop: Pt[], eps: number): Pt[] {
  if (loop.length < 4) return loop;
  const [x0, y0] = loop[0];
  let far = 1;
  let best = -1;
  for (let i = 1; i < loop.length; i++) {
    const d = (loop[i][0] - x0) ** 2 + (loop[i][1] - y0) ** 2;
    if (d > best) {
      best = d;
      far = i;
    }
  }
  const a = rdp(loop.slice(0, far + 1), eps);
  const b = rdp([...loop.slice(far), loop[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

const area = (p: Pt[]) => {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
};

function pointInPoly([x, y]: Pt, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const logoCache = new Map<string, Promise<TracedLogo>>();

export function traceLogo(url: string): Promise<TracedLogo> {
  if (logoCache.has(url)) return logoCache.get(url)!;
  const p = new Promise<TracedLogo>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const GW = 520;
      const GH = Math.max(8, Math.round((img.height / img.width) * GW));
      const W = GW + 2;
      const H = GH + 2;
      const cv = document.createElement('canvas');
      cv.width = GW;
      cv.height = GH;
      const ctx = cv.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, GW, GH);
      const data = ctx.getImageData(0, 0, GW, GH).data;
      const field = new Float32Array(W * H);
      for (let y = 0; y < GH; y++)
        for (let x = 0; x < GW; x++) {
          const o = (y * GW + x) * 4;
          const r = data[o] / 255;
          const g = data[o + 1] / 255;
          const b = data[o + 2] / 255;
          const a = data[o + 3] / 255;
          const mx = Math.max(r, g, b);
          const mn = Math.min(r, g, b);
          const sat = mx > 0 ? (mx - mn) / mx : 0;
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          field[(y + 1) * W + (x + 1)] = a * Math.max(sat * 1.3, 1 - lum > 0.6 ? 1 - lum : 0);
        }
      const loops = traceContours(field, W, H)
        .map((l) => simplifyClosed(l, 0.45))
        .filter((l) => l.length >= 3 && Math.abs(area(l)) > 12);
      if (!loops.length) {
        reject(new Error('Logo tracing produced no contours'));
        return;
      }
      // Classify outer contours vs holes by nesting depth.
      const info = loops.map((l, i) => ({ l, i, a: Math.abs(area(l)), depth: 0, parent: -1 }));
      for (const it of info) {
        let best = -1;
        for (const o of info) {
          if (o === it || o.a <= it.a) continue;
          if (pointInPoly(it.l[0], o.l)) {
            it.depth++;
            if (best === -1 || o.a < info[best].a) best = o.i;
          }
        }
        it.parent = best;
      }
      // Pixel → shape space (y up). Grid is offset by the 1px padding.
      const toV = ([x, y]: Pt) => new THREE.Vector2(x - 1, GH - (y - 1));
      const shapes: THREE.Shape[] = [];
      const shapeOf = new Map<number, THREE.Shape>();
      for (const it of info.filter((x) => x.depth % 2 === 0)) {
        const s = new THREE.Shape(it.l.map(toV));
        shapes.push(s);
        shapeOf.set(it.i, s);
      }
      for (const it of info.filter((x) => x.depth % 2 === 1)) {
        const parent = shapeOf.get(it.parent);
        if (parent) parent.holes.push(new THREE.Path(it.l.map(toV)));
      }
      const depth = GW * 0.022;
      const uvGen = {
        generateTopUV(_g: THREE.ExtrudeGeometry, v: number[], a: number, b: number, c: number) {
          return [a, b, c].map((k) => new THREE.Vector2(v[k * 3] / GW, v[k * 3 + 1] / GH));
        },
        generateSideWallUV() {
          return [new THREE.Vector2(0, 0), new THREE.Vector2(1, 0), new THREE.Vector2(1, 1), new THREE.Vector2(0, 1)];
        },
      };
      const geometry = new THREE.ExtrudeGeometry(shapes, {
        depth,
        bevelEnabled: true,
        bevelThickness: depth * 0.18,
        bevelSize: GW * 0.0018,
        bevelSegments: 2,
        curveSegments: 1,
        UVGenerator: uvGen as unknown as THREE.UVGenerator,
      });
      geometry.computeBoundingBox();
      const bb = geometry.boundingBox!;
      const w = bb.max.x - bb.min.x;
      const h = bb.max.y - bb.min.y;
      // Center & normalise to width 1 (UVs were computed from original pixel coords, so they stay valid).
      geometry.translate(-(bb.min.x + w / 2), -(bb.min.y + h / 2), -depth);
      geometry.scale(1 / w, 1 / w, 1 / w);
      geometry.computeVertexNormals();
      const texture = new THREE.CanvasTexture(cv);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      resolve({ geometry, texture, width: 1, height: h / w });
    };
    img.onerror = () => reject(new Error(`Could not load logo ${url}`));
    img.src = url;
  });
  logoCache.set(url, p);
  return p;
}

function useTracedLogo() {
  const [logo, setLogo] = useState<TracedLogo | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    traceLogo(LOGO_URL)
      .then((l) => alive && setLogo(l))
      .catch((e) => {
        console.warn('[logo]', e);
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  return { logo, failed };
}

/** Fallback text sign if the logo image is missing. */
function TextFallback({ width }: { width: number }) {
  const tex = useMemo(() => {
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = 300;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#F7941D';
    c.font = '800 220px "Be Vietnam Pro", system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('XBRAIN', 512, 160);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return (
    <mesh>
      <planeGeometry args={[width, width * 0.29]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} />
    </mesh>
  );
}

function GlbLogo({ width }: { width: number }) {
  const { scene } = useGLTF(LOGO_URL);
  const obj = useMemo(() => {
    const s = scene.clone(true);
    const box = new THREE.Box3().setFromObject(s);
    const size = box.getSize(new THREE.Vector3());
    s.position.sub(box.getCenter(new THREE.Vector3()));
    const g = new THREE.Group();
    g.add(s);
    g.scale.setScalar(width / Math.max(size.x, 1e-3));
    return g;
  }, [scene, width]);
  return <primitive object={obj} />;
}

function LogoSign({ f }: { f: FurnitureDef }) {
  const { logo, failed } = useTracedLogo();
  const isGlb = LOGO_URL.toLowerCase().endsWith('.glb') || LOGO_URL.toLowerCase().endsWith('.gltf');
  const lobby = f.variant === 'lobby';
  const depthScale = f.variant === 'facade' ? 1.6 : 1;
  const mats = useMemo(() => {
    if (!logo) return null;
    const front = new THREE.MeshStandardMaterial({
      map: logo.texture,
      roughness: 0.35,
      metalness: 0.1,
      emissive: new THREE.Color('#ffffff'),
      emissiveMap: logo.texture,
      emissiveIntensity: lobby ? 0.55 : 0.25,
    });
    const side = new THREE.MeshStandardMaterial({ color: '#d9771a', roughness: 0.4, metalness: 0.2 });
    return [front, side];
  }, [logo, lobby]);
  const glow = useMemo(() => {
    if (!lobby) return null;
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 128;
    const c = cv.getContext('2d')!;
    const g = c.createRadialGradient(128, 64, 4, 128, 64, 120);
    g.addColorStop(0, 'rgba(255,190,110,0.85)');
    g.addColorStop(0.5, 'rgba(255,150,60,0.25)');
    g.addColorStop(1, 'rgba(255,140,40,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 128);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [lobby]);

  return (
    <group position={[f.x, f.y ?? 0, f.z]} rotation={[0, f.rotY, 0]}>
      {glow && (
        <mesh position={[0, 0, 0.005]}>
          <planeGeometry args={[f.w * 1.5, f.w * 0.75]} />
          <meshBasicMaterial map={glow} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      {lobby && (
        <>
          <pointLight position={[0, 0, 0.9]} intensity={3.2} distance={6} color="#ffd6a0" />
          <mesh position={[0, -f.w * 0.27, 0.03]}>
            <boxGeometry args={[f.w * 0.9, 0.012, 0.012]} />
            <meshBasicMaterial color="#ffb45e" toneMapped={false} />
          </mesh>
        </>
      )}
      <group position={[0, 0, (lobby ? 0.035 : 0.01) + 0.0]}>
        {isGlb ? (
          <Suspense fallback={<TextFallback width={f.w} />}>
            <GlbLogo width={f.w} />
          </Suspense>
        ) : logo && mats ? (
          <mesh geometry={logo.geometry} material={mats} scale={[f.w, f.w, f.w * depthScale]} position={[0, 0, f.w * 0.022 * depthScale * (1 / 1)]} castShadow />
        ) : failed ? (
          <TextFallback width={f.w} />
        ) : null}
      </group>
    </group>
  );
}

export function LogoSigns() {
  return (
    <group>
      {FURNITURE.filter((f) => f.type === 'logoSign').map((f) => (
        <LogoSign key={f.id} f={f} />
      ))}
    </group>
  );
}
