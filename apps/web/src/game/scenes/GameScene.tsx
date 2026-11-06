import { Suspense, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import { useSettings } from '../../stores/settings';
import { useGame } from '../../stores/game';
import { runtime } from '../runtime';
import { Building } from '../environment/Building';
import { Colliders } from '../environment/Colliders';
import { InteractiveObjects } from '../environment/Interactive';
import { Lighting } from '../environment/Lighting';
import { LogoSigns } from '../environment/Logo3D';
import { Outdoor } from '../environment/Outdoor';
import { useTimeOfDay } from '../environment/timeOfDay';
import { LocalPlayer } from '../avatars/LocalPlayer';
import { RemotePlayers } from '../avatars/RemotePlayers';
import { CameraRig } from '../cameras/CameraRig';
import { InteractionSystem } from '../interactions/InteractionSystem';
import { NavGuide } from '../interactions/NavGuide';

/** Frame statistics for the performance monitor (FPS, draw calls, triangles). */
function PerfProbe() {
  const { gl } = useThree();
  useFrame((_, dt) => {
    const s = runtime.stats;
    s.frameMs = s.frameMs * 0.9 + dt * 1000 * 0.1;
    s.fps = 1000 / Math.max(1, s.frameMs);
    s.drawCalls = gl.info.render.calls;
    s.triangles = gl.info.render.triangles;
  });
  return null;
}

function ReadySignal({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    onReady();
  }, [onReady]);
  return null;
}

export function GameScene({ onReady }: { onReady: () => void }) {
  const quality = useSettings((s) => s.quality);
  const tod = useTimeOfDay();
  const shadows = quality !== 'low';
  const dpr: [number, number] = quality === 'high' ? [1, 2] : quality === 'medium' ? [1, 1.5] : [0.75, 1];

  return (
    <Canvas
      key={quality}
      shadows={shadows ? 'soft' : false}
      dpr={dpr}
      gl={{ antialias: quality !== 'low', powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: useSettings.getState().fov, near: 0.05, far: 6000, position: [0, 3, 17] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
      onPointerMissed={() => useGame.getState().set({ emoteOpen: false })}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Suspense fallback={null}>
        <Physics timeStep="vary" gravity={[0, -9.81, 0]}>
          <Colliders />
          <LocalPlayer />
          <RemotePlayers />
          <CameraRig />
        </Physics>
        <Lighting tod={tod} quality={quality} />
        <Outdoor tod={tod} />
        <Building shadows={shadows} />
        <LogoSigns />
        <InteractiveObjects />
        <InteractionSystem />
        <NavGuide />
        <PerfProbe />
        <ReadySignal onReady={onReady} />
      </Suspense>
    </Canvas>
  );
}
