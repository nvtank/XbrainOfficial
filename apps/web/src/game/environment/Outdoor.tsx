/**
 * Đà Nẵng outside the glass façade: Hàn river mouth, the Thuận Phước suspension
 * bridge (two portal towers, catenary main cables, hangers, LED lighting at night),
 * city blocks and the Sơn Trà peninsula. Low-poly + instancing → a few draw calls.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sky, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { cityTextures } from './materials';
import { TOD_PRESETS, type Tod } from './timeOfDay';

const WATER_Y = -36;
const DECK_Y = WATER_Y + 27;
const BX = 330; // bridge centerline (x)
const Z0 = -780;
const Z1 = 540;
const T1 = -265;
const T2 = 45;
const TOP_Y = WATER_Y + 102;
const MID_Y = DECK_Y + 6;

function cableY(z: number): number {
  if (z >= T1 && z <= T2) {
    const c = (T1 + T2) / 2;
    const h = (T2 - T1) / 2;
    const u = (z - c) / h;
    return MID_Y + (TOP_Y - MID_Y) * u * u;
  }
  const [a, b] = z < T1 ? [Z0, T1] : [T2, Z1];
  const t = (z - a) / (b - a);
  const ya = z < T1 ? DECK_Y + 1.5 : TOP_Y;
  const yb = z < T1 ? TOP_Y : DECK_Y + 1.5;
  return ya + (yb - ya) * t - 10 * 4 * t * (1 - t);
}

function makeWaterNormal() {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const c = cv.getContext('2d')!;
  const img = c.createImageData(s, s);
  const h = (x: number, y: number) =>
    Math.sin((x / s) * Math.PI * 8) * 0.5 + Math.sin(((x + y) / s) * Math.PI * 14) * 0.3 + Math.sin((y / s) * Math.PI * 22 + Math.sin((x / s) * 6)) * 0.25;
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      const dx = h(x + 1, y) - h(x - 1, y);
      const dy = h(x, y + 1) - h(x, y - 1);
      const n = new THREE.Vector3(-dx, -dy, 2).normalize();
      const o = (y * s + x) * 4;
      img.data[o] = (n.x * 0.5 + 0.5) * 255;
      img.data[o + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[o + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  c.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(140, 260);
  return t;
}

function Water({ tod }: { tod: Tod }) {
  const normal = useMemo(makeWaterNormal, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2b6a82', roughness: 0.22, metalness: 0.3, normalMap: normal, normalScale: new THREE.Vector2(0.12, 0.12) }), [normal]);
  mat.color.set(TOD_PRESETS[tod].water);
  useFrame((_, dt) => {
    normal.offset.x += dt * 0.004;
    normal.offset.y += dt * 0.0025;
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2000, WATER_Y, 0]} material={mat}>
      <planeGeometry args={[9000, 9000]} />
    </mesh>
  );
}

function Land({ tod }: { tod: Tod }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#59605a', roughness: 1 }), []);
  const green = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3f5e43', roughness: 1 }), []);
  mat.color.set(tod === 'night' ? '#1b1f24' : tod === 'sunset' ? '#4d4a4a' : '#59605a');
  green.color.set(tod === 'night' ? '#16231a' : '#3f5e43');
  const building = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3d4a57', roughness: 0.3, metalness: 0.6 }), []);
  return (
    <group>
      {/* Near bank (our side) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-1935, WATER_Y + 1.8, 0]} material={mat}>
        <planeGeometry args={[4130, 9000]} />
      </mesh>
      <mesh position={[110, WATER_Y + 0.9, 0]} material={green}>
        <boxGeometry args={[40, 1.8, 9000]} />
      </mesh>
      {/* North headland and south bank framing the river mouth */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1250, WATER_Y + 1.8, -2330]} material={mat}>
        <planeGeometry args={[2300, 3540]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[900, WATER_Y + 1.8, 2200]} material={mat}>
        <planeGeometry args={[1600, 3600]} />
      </mesh>
      {/* Our own tower below the office floor */}
      <mesh position={[-2, (WATER_Y + 1.8 - 0.3) / 2, -8]} material={building}>
        <boxGeometry args={[32, -(WATER_Y + 1.8) - 0.3, 48]} />
      </mesh>
    </group>
  );
}

function City({ tod }: { tod: Tod }) {
  const glow = TOD_PRESETS[tod].cityGlow;
  const { mesh, mat } = useMemo(() => {
    const tex = cityTextures();
    const mat = new THREE.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.emissive, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, roughness: 0.6, metalness: 0.2 });
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    let seed = 42;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const items: Array<[number, number, number, number, number]> = [];
    const region = (n: number, x0: number, x1: number, z0: number, z1: number, hMin: number, hMax: number) => {
      for (let i = 0; i < n; i++) {
        const x = x0 + r() * (x1 - x0);
        const z = z0 + r() * (z1 - z0);
        if (Math.abs(x + 2) < 70 && Math.abs(z + 8) < 80) continue;
        const w = 20 + r() * 35;
        const d = 20 + r() * 35;
        const h = hMin + Math.pow(r(), 2.2) * (hMax - hMin);
        items.push([x, z, w, d, h]);
      }
    };
    region(170, -1600, 60, -1400, 1400, 12, 150);
    region(90, 200, 2300, -2600, -620, 10, 110);
    region(80, 220, 1550, 420, 2600, 10, 130);
    const m = new THREE.InstancedMesh(geo, mat, items.length);
    const o = new THREE.Object3D();
    items.forEach(([x, z, w, d, h], i) => {
      o.position.set(x, WATER_Y + 1.8, z);
      o.scale.set(w, h, d);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.frustumCulled = false;
    return { mesh: m, mat };
  }, []);
  mat.emissiveIntensity = glow;
  return <primitive object={mesh} />;
}

function Mountains({ tod }: { tod: Tod }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4f6f63', roughness: 1 }), []);
  mat.color.set(tod === 'night' ? '#0f1a1c' : tod === 'sunset' ? '#5a5560' : '#5f7f74');
  const peaks: Array<[number, number, number, number]> = [
    [2900, 600, 900, 620], [3300, 1300, 1100, 540], [2600, 1700, 800, 420], [3600, 300, 700, 480],
    [3800, -2600, 1200, 700], [3200, -3200, 1000, 560], [4200, -1900, 900, 460],
  ];
  const geo = useMemo(() => {
    const g = new THREE.ConeGeometry(1, 1, 24, 6);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > -0.49) {
        // Rounded ridge profile + gentle noise → reads as hills, not spikes
        const k = 0.5 - y;
        const bulge = Math.pow(k, 0.55) / Math.max(k, 1e-3);
        const n = 0.88 + 0.12 * Math.sin(i * 12.9898) * Math.cos(i * 4.1414);
        pos.setX(i, pos.getX(i) * bulge * n);
        pos.setZ(i, pos.getZ(i) * bulge * n);
      }
    }
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <group>
      {peaks.map(([x, z, r, h], i) => (
        <mesh key={i} geometry={geo} material={mat} position={[x, WATER_Y + h / 2, z]} scale={[r, h, r * 0.8]} />
      ))}
    </group>
  );
}

function Bridge({ tod }: { tod: Tod }) {
  const glow = TOD_PRESETS[tod].bridgeGlow;
  const cableMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d9dde2', roughness: 0.4, metalness: 0.5, emissive: new THREE.Color('#3b82f6'), emissiveIntensity: 0 }), []);
  const towerMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e7e2d8', roughness: 0.7, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 }), []);
  const deckMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8e8f8f', roughness: 0.8 }), []);
  const lightMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffd59a', toneMapped: false }), []);
  const stripMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#60a5fa', toneMapped: false }), []);
  const reflMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffb36b', transparent: true, opacity: 0.0, fog: false, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), []);

  const { cables, hangers, lights, deck, refl } = useMemo(() => {
    const len = Z1 - Z0;
    const deck = new THREE.Group();
    const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0) => {
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z);
      mesh.rotation.x = rx;
      deck.add(mesh);
    };
    add(new THREE.BoxGeometry(24, 2.2, len), deckMat, BX, DECK_Y, (Z0 + Z1) / 2);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.5, 0.5, len), stripMat, BX + s * 12.2, DECK_Y + 1.3, (Z0 + Z1) / 2);
    // Approach ramps down to the banks
    const rampLen = 260;
    const drop = DECK_Y - (WATER_Y + 1.8);
    const ang = Math.atan2(drop, rampLen);
    add(new THREE.BoxGeometry(24, 2.2, Math.hypot(rampLen, drop)), deckMat, BX, DECK_Y - drop / 2, Z0 - rampLen / 2, -ang);
    add(new THREE.BoxGeometry(24, 2.2, Math.hypot(rampLen, drop)), deckMat, BX, DECK_Y - drop / 2, Z1 + rampLen / 2, ang);
    // Piers
    for (let z = Z0 + 60; z < Z1; z += 120) {
      if (Math.abs(z - T1) < 40 || Math.abs(z - T2) < 40 || (z > T1 && z < T2)) continue;
      add(new THREE.BoxGeometry(6, DECK_Y - WATER_Y, 6), towerMat, BX, (DECK_Y + WATER_Y) / 2 - 1, z);
    }
    // Towers: two legs + three cross beams + footing
    for (const tz of [T1, T2]) {
      for (const s of [-1, 1]) {
        const g = new THREE.BoxGeometry(5, TOP_Y - WATER_Y + 4, 7);
        const m = new THREE.Mesh(g, towerMat);
        m.position.set(BX + s * 13.5, (TOP_Y + WATER_Y) / 2 + 2, tz);
        m.rotation.z = s * -0.025;
        deck.add(m);
      }
      for (const y of [DECK_Y - 2.5, WATER_Y + 72, TOP_Y]) add(new THREE.BoxGeometry(30, 4, 6), towerMat, BX, y, tz);
      add(new THREE.BoxGeometry(40, 6, 16), towerMat, BX, WATER_Y + 2, tz);
    }

    // Main cables (catenary-like curve through anchorages, tower tops and mid-span)
    const cables = new THREE.Group();
    for (const s of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let z = Z0; z <= Z1; z += 8) pts.push(new THREE.Vector3(BX + s * 12, cableY(z), z));
      const curve = new THREE.CatmullRomCurve3(pts);
      cables.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 220, 0.9, 6, false), cableMat));
    }
    // Hangers (instanced)
    const hz: number[] = [];
    for (let z = Z0 + 10; z < Z1 - 5; z += 10) if (Math.abs(z - T1) > 6 && Math.abs(z - T2) > 6) hz.push(z);
    const hangers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 1, 0.22), cableMat, hz.length * 2);
    const o = new THREE.Object3D();
    let k = 0;
    for (const z of hz)
      for (const s of [-1, 1]) {
        const top = cableY(z);
        const h = Math.max(0.5, top - (DECK_Y + 1.1));
        o.position.set(BX + s * 12, DECK_Y + 1.1 + h / 2, z);
        o.scale.set(1, h, 1);
        o.updateMatrix();
        hangers.setMatrixAt(k++, o.matrix);
      }
    hangers.instanceMatrix.needsUpdate = true;
    // Deck lights + their reflections on the water
    const lz: number[] = [];
    for (let z = Z0; z <= Z1; z += 22) lz.push(z);
    const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.9, 8, 6), lightMat, lz.length * 2);
    const refl = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.2, 160), reflMat, lz.length * 2);
    k = 0;
    for (const z of lz)
      for (const s of [-1, 1]) {
        o.position.set(BX + s * 12.5, DECK_Y + 6, z);
        o.scale.set(1, 1, 1);
        o.rotation.set(0, 0, 0);
        o.updateMatrix();
        lights.setMatrixAt(k, o.matrix);
        o.position.set(BX + s * 12.5 - 80, WATER_Y + 0.15, z);
        o.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
        o.updateMatrix();
        refl.setMatrixAt(k, o.matrix);
        k++;
      }
    lights.instanceMatrix.needsUpdate = true;
    refl.instanceMatrix.needsUpdate = true;
    return { cables, hangers, lights, deck, refl };
  }, [cableMat, towerMat, deckMat, lightMat, stripMat, reflMat]);

  // Cars crossing the bridge
  const cars = useMemo(() => {
    const n = 26;
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 1.5, 4.5), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, metalness: 0.4 }), n);
    const colors = ['#d9d9d9', '#1f2937', '#b91c1c', '#2563eb', '#f5f5f4', '#6b7280'];
    for (let i = 0; i < n; i++) m.setColorAt(i, new THREE.Color(colors[i % colors.length]));
    return m;
  }, []);
  const carState = useMemo(() => Array.from({ length: 26 }, (_, i) => ({ z: Z0 - 200 + ((i * 97) % (Z1 - Z0 + 400)), lane: i % 4, speed: 14 + (i % 5) * 2.5 })), []);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const hue = useRef(0);

  useFrame((_, dt) => {
    // LED colour cycle at night (Thuận Phước's signature lighting)
    hue.current = (hue.current + dt * 0.03) % 1;
    cableMat.emissive.setHSL(hue.current, 0.85, 0.55);
    cableMat.emissiveIntensity = glow * 0.9;
    towerMat.emissive.setHSL((hue.current + 0.5) % 1, 0.6, 0.6);
    towerMat.emissiveIntensity = glow * 0.25;
    stripMat.color.setHSL((hue.current + 0.25) % 1, 0.9, glow > 0 ? 0.6 : 0.3);
    lightMat.color.set(glow > 0 ? '#ffd59a' : '#9a9a9a');
    reflMat.opacity = glow > 0 ? 0.12 * glow : 0;
    carState.forEach((c, i) => {
      const dir = c.lane < 2 ? 1 : -1;
      c.z += dir * c.speed * dt;
      if (c.z > Z1 + 200) c.z = Z0 - 200;
      if (c.z < Z0 - 200) c.z = Z1 + 200;
      const laneX = BX + (c.lane - 1.5) * 4.6;
      let y = DECK_Y + 1.85;
      if (c.z < Z0) y -= ((Z0 - c.z) / 260) * (DECK_Y - WATER_Y - 1.8);
      if (c.z > Z1) y -= ((c.z - Z1) / 260) * (DECK_Y - WATER_Y - 1.8);
      tmp.position.set(laneX, y, c.z);
      tmp.updateMatrix();
      cars.setMatrixAt(i, tmp.matrix);
    });
    cars.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <primitive object={deck} />
      <primitive object={cables} />
      <primitive object={hangers} />
      <primitive object={lights} />
      <primitive object={refl} />
      <primitive object={cars} />
    </group>
  );
}

function Boats() {
  const ref = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    ref.current.children.forEach((b, i) => {
      b.position.z = -600 + ((t * (6 + i * 3) + i * 400) % 1400);
      b.position.y = WATER_Y + 0.6 + Math.sin(t + i) * 0.15;
    });
  });
  return (
    <group ref={ref}>
      {[160, 230, 520].map((x, i) => (
        <group key={i} position={[x, WATER_Y, 0]}>
          <mesh>
            <boxGeometry args={[5, 1.4, 16]} />
            <meshStandardMaterial color={i === 1 ? '#f7941d' : '#e7e5e4'} roughness={0.6} />
          </mesh>
          <mesh position={[0, 1.4, -2]}>
            <boxGeometry args={[3.6, 1.6, 5]} />
            <meshStandardMaterial color="#334155" roughness={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function Outdoor({ tod }: { tod: Tod }) {
  const p = TOD_PRESETS[tod];
  const sunPos = useMemo(() => new THREE.Vector3(...p.sunDir).normalize().multiplyScalar(4000), [p]);
  return (
    <group>
      {tod !== 'night' ? (
        <Sky distance={4500} sunPosition={sunPos} turbidity={p.turbidity} rayleigh={p.rayleigh} mieCoefficient={p.mie} mieDirectionalG={p.mieG} />
      ) : (
        <>
          <color attach="background" args={['#060a16']} />
          <Stars radius={2400} depth={300} count={2500} factor={18} saturation={0} fade speed={0.3} />
          <mesh position={[1800, 900, -1500]}>
            <sphereGeometry args={[40, 16, 12]} />
            <meshBasicMaterial color="#f4f1e6" toneMapped={false} fog={false} />
          </mesh>
        </>
      )}
      <fog attach="fog" args={[p.fog, p.fogNear, p.fogFar]} />
      <Water tod={tod} />
      <Land tod={tod} />
      <City tod={tod} />
      <Mountains tod={tod} />
      <Bridge tod={tod} />
      <Boats />
    </group>
  );
}
