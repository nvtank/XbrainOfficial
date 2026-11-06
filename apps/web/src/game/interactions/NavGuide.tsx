/** Floor route guidance to a selected room / desk (re-planned as the avatar moves). */
import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { planRoute } from '@xbrain/shared';
import { useGame } from '../../stores/game';
import { runtime } from '../runtime';

export function NavGuide() {
  const target = useGame((s) => s.navTarget);
  const [pts, setPts] = useState<THREE.Vector3[]>([]);
  const acc = useRef(1);
  const flag = useRef<THREE.Group>(null!);

  useFrame(({ clock }, dt) => {
    if (!target) {
      if (pts.length) setPts([]);
      return;
    }
    acc.current += dt;
    const dest = target.points[target.points.length - 1];
    const L = runtime.local.pos;
    if (Math.hypot(L.x - dest.x, L.z - dest.z) < 1.6) {
      useGame.getState().set({ navTarget: null });
      useGame.getState().toast('success', `You have arrived: ${target.label}`);
      return;
    }
    if (acc.current > 0.5) {
      acc.current = 0;
      const route = planRoute({ x: L.x, z: L.z }, target.zone ? { zone: target.zone } : { point: dest });
      const path = route.length ? route : [{ x: L.x, z: L.z }, dest];
      setPts(path.map((p) => new THREE.Vector3(p.x, 0.06, p.z)));
    }
    if (flag.current) {
      flag.current.position.set(dest.x, 0, dest.z);
      flag.current.rotation.y = clock.elapsedTime;
    }
  });

  if (!target || pts.length < 2) return null;
  return (
    <group>
      <Line points={pts} color="#F7941D" lineWidth={5} dashed dashSize={0.5} gapSize={0.3} transparent opacity={0.9} renderOrder={4} />
      <group ref={flag}>
        <mesh position={[0, 1.2, 0]}>
          <coneGeometry args={[0.18, 0.4, 4]} />
          <meshBasicMaterial color="#F7941D" toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.6, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 1.2, 6]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </group>
    </group>
  );
}
