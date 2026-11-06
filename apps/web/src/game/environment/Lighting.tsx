import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import type { Quality } from '../../stores/settings';
import { MATS } from './materials';
import { TOD_PRESETS, type Tod } from './timeOfDay';

/** Sun/moon, sky light, interior fill and an offline-generated environment map for reflections. */
export function Lighting({ tod, quality }: { tod: Tod; quality: Quality }) {
  const p = TOD_PRESETS[tod];
  const sun = useRef<THREE.DirectionalLight>(null!);
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(-1, 0, -10);
    return o;
  }, []);
  const { gl, scene } = useThree();
  const shadows = quality !== 'low';
  const mapSize = quality === 'high' ? 4096 : 2048;

  useEffect(() => {
    gl.toneMappingExposure = p.exposure;
    MATS.led.emissiveIntensity = p.led;
    MATS.ledWarm.emissiveIntensity = p.led * 1.2;
  }, [gl, p]);

  useEffect(() => {
    scene.add(target);
    return () => void scene.remove(target);
  }, [scene, target]);

  const sunPos = useMemo(() => new THREE.Vector3(...p.sunDir).normalize().multiplyScalar(70).add(target.position), [p, target]);

  useEffect(() => {
    if (!sun.current) return;
    sun.current.target = target;
    const cam = sun.current.shadow.camera as THREE.OrthographicCamera;
    cam.left = -34;
    cam.right = 34;
    cam.top = 34;
    cam.bottom = -34;
    cam.near = 5;
    cam.far = 160;
    cam.updateProjectionMatrix();
    sun.current.shadow.bias = -0.0004;
    sun.current.shadow.normalBias = 0.03;
  }, [target, shadows, mapSize]);

  return (
    <>
      <hemisphereLight args={[p.hemiSky, p.hemiGround, p.hemiIntensity]} />
      <ambientLight color={p.ambientColor} intensity={p.ambient} />
      <directionalLight
        ref={sun}
        position={sunPos}
        color={p.sunColor}
        intensity={p.sunIntensity}
        castShadow={shadows}
        shadow-mapSize-width={mapSize}
        shadow-mapSize-height={mapSize}
      />
      {/* Interior fill from the office LED panels */}
      <directionalLight position={[2, 10, -12]} intensity={tod === 'night' ? 0.55 : 0.25} color="#fff8ee" />
      {quality !== 'low' && (
        <Environment resolution={128} frames={1} background={false}>
          <Lightformer intensity={tod === 'night' ? 0.6 : 2} form="rect" position={[0, 6, -10]} scale={[20, 20, 1]} rotation={[Math.PI / 2, 0, 0]} />
          <Lightformer intensity={tod === 'night' ? 0.3 : 1.4} color={tod === 'sunset' ? '#ffb27a' : '#dbe9ff'} form="rect" position={[30, 4, -10]} scale={[40, 8, 1]} rotation={[0, -Math.PI / 2, 0]} />
          <Lightformer intensity={0.5} color="#f7941d" form="ring" position={[-20, 3, 5]} scale={6} />
        </Environment>
      )}
    </>
  );
}
