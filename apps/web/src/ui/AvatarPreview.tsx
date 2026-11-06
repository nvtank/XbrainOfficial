import { useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { AvatarConfig, EmoteName } from '@xbrain/shared';
import { AvatarEntity } from '../game/avatars/AvatarEntity';
import type { Loco } from '../game/avatars/animator';

export type PreviewAnim = 'idle' | 'walk' | 'sit' | EmoteName;

function PreviewAvatar({ cfg, anim }: { cfg: AvatarConfig; anim: PreviewAnim }) {
  const entity = useMemo(() => new AvatarEntity(cfg, { castShadow: true }), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => entity.setConfig(cfg), [entity, cfg]);
  useEffect(() => {
    entity.setPlate(null);
    return () => entity.dispose();
  }, [entity]);
  useFrame((_, dt) => {
    const loco: Loco = anim === 'walk' ? 'walk' : anim === 'sit' ? 'sit' : 'idle';
    const emote = anim !== 'idle' && anim !== 'walk' && anim !== 'sit' ? anim : null;
    entity.update(Math.min(dt, 0.05), { loco, speed: 2.4, emote, talking: false });
  });
  return <primitive object={entity.group} />;
}

export function AvatarPreview({ cfg, anim, autoRotate }: { cfg: AvatarConfig; anim: PreviewAnim; autoRotate: boolean }) {
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 0.82, 3.1], fov: 30 }} gl={{ antialias: true }} onCreated={({ gl }) => (gl.toneMapping = THREE.ACESFilmicToneMapping)}>
      <color attach="background" args={['#16181d']} />
      <hemisphereLight args={['#ffffff', '#3b3b3b', 0.9]} />
      <directionalLight position={[3, 5, 4]} intensity={2.2} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <directionalLight position={[-4, 3, -3]} intensity={0.9} color="#F7941D" />
      <PreviewAvatar cfg={cfg} anim={anim} />
      {anim === 'sit' && (
        <mesh position={[0, 0.235, -0.06]} castShadow>
          <boxGeometry args={[0.46, 0.47, 0.46]} />
          <meshStandardMaterial color="#2a2d33" />
        </mesh>
      )}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[1.4, 48]} />
        <meshStandardMaterial color="#23262d" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <ringGeometry args={[1.32, 1.4, 64]} />
        <meshBasicMaterial color="#F7941D" toneMapped={false} />
      </mesh>
      <ContactShadows position={[0, 0.003, 0]} opacity={0.5} scale={4} blur={2.5} far={2} />
      <OrbitControls target={[0, 0.6, 0]} enablePan={false} minDistance={1.0} maxDistance={5} minPolarAngle={0.3} maxPolarAngle={Math.PI / 2 - 0.05} autoRotate={autoRotate} autoRotateSpeed={1.4} />
    </Canvas>
  );
}
