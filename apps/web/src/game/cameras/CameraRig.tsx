/**
 * Camera system: third-person (default, collision-aware), first-person (pointer
 * lock), office overview (orbit, ceiling hidden) and room focus presets — with
 * smooth animated transitions between any two modes.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { CAMERA_PRESETS, EYE_HEIGHT, SEAT_BY_ID } from '@xbrain/shared';
import { useGame } from '../../stores/game';
import { useSettings } from '../../stores/settings';
import { runtime } from '../runtime';

const tmpV = new THREE.Vector3();

export function CameraRig() {
  const { camera, gl } = useThree();
  const { world, rapier } = useRapier();
  const mode = useGame((s) => s.cameraMode);
  const presetId = useGame((s) => s.cameraPreset);
  const fov = useSettings((s) => s.fov);
  const controls = useRef<OrbitControlsImpl>(null);
  const st = useRef({ yaw: Math.PI, pitch: 0.32, dist: 4.2, dragging: false, lastX: 0, lastY: 0, pyaw: 0, ppitch: 0 });
  const trans = useRef<{ fromPos: THREE.Vector3; fromTarget: THREE.Vector3; t: number } | null>(null);
  const lookTarget = useRef(new THREE.Vector3(0, 1.5, 6));
  const orbitReady = useRef(false);
  const preset = useMemo(() => {
    if (mode === 'overview') return CAMERA_PRESETS.find((p) => p.id === 'overview')!;
    if (mode === 'preset') return CAMERA_PRESETS.find((p) => p.id === presetId) ?? null;
    return null;
  }, [mode, presetId]);
  /** Base look direction of a room camera (the user can look around from it by dragging). */
  const presetDir = useMemo(() => {
    if (!preset || mode !== 'preset') return null;
    const d = new THREE.Vector3(...preset.target).sub(new THREE.Vector3(...preset.position)).normalize();
    return { yaw: Math.atan2(d.x, d.z), pitch: Math.asin(THREE.MathUtils.clamp(-d.y, -1, 1)) };
  }, [preset, mode]);

  useEffect(() => {
    (camera as THREE.PerspectiveCamera).fov = fov;
    (camera as THREE.PerspectiveCamera).far = 6000;
    (camera as THREE.PerspectiveCamera).near = 0.05;
    camera.updateProjectionMatrix();
    runtime.camera = camera;
  }, [camera, fov]);

  // Start an animated transition whenever the mode/preset changes.
  useEffect(() => {
    trans.current = { fromPos: camera.position.clone(), fromTarget: lookTarget.current.clone(), t: 0 };
    orbitReady.current = false;
    if (mode !== 'first' && document.pointerLockElement) document.exitPointerLock();
    if (mode === 'third' || mode === 'first') st.current.yaw = runtime.camYaw;
    st.current.pyaw = 0;
    st.current.ppitch = 0;
  }, [mode, presetId, camera]);

  // Desk camera when sitting down at a desk.
  useEffect(
    () =>
      useGame.subscribe((s, prev) => {
        if (s.seatPhase === 'seated' && prev.seatPhase !== 'seated' && s.seatId) {
          const seat = SEAT_BY_ID[s.seatId];
          if (seat && useSettings.getState().autoDeskCamera && s.cameraMode === 'third') {
            st.current.yaw = seat.rotY;
            st.current.pitch = seat.kind === 'desk' ? 0.42 : 0.3;
            st.current.dist = seat.kind === 'desk' ? 1.9 : 2.6;
          }
        }
        if (s.seatPhase === 'none' && prev.seatPhase !== 'none' && s.cameraMode === 'third') st.current.dist = Math.max(st.current.dist, 3.6);
      }),
    [],
  );

  // Mouse look
  useEffect(() => {
    const el = gl.domElement;
    const sens = () => useSettings.getState().mouseSensitivity * 0.0026;
    const inv = () => (useSettings.getState().invertY ? -1 : 1);
    const onDown = (e: PointerEvent) => {
      const m = useGame.getState().cameraMode;
      if (m === 'first') {
        if (!document.pointerLockElement) el.requestPointerLock?.();
      } else if (m === 'third' || m === 'preset') {
        st.current.dragging = true;
        st.current.lastX = e.clientX;
        st.current.lastY = e.clientY;
        el.setPointerCapture?.(e.pointerId);
      }
    };
    const onMove = (e: PointerEvent) => {
      const m = useGame.getState().cameraMode;
      let dx = 0;
      let dy = 0;
      if (document.pointerLockElement === el) {
        dx = e.movementX;
        dy = e.movementY;
      } else if (st.current.dragging && (m === 'third' || m === 'preset')) {
        dx = e.clientX - st.current.lastX;
        dy = e.clientY - st.current.lastY;
        st.current.lastX = e.clientX;
        st.current.lastY = e.clientY;
      } else return;
      if (m === 'preset') {
        st.current.pyaw = THREE.MathUtils.clamp(st.current.pyaw - dx * sens(), -1.2, 1.2);
        st.current.ppitch = THREE.MathUtils.clamp(st.current.ppitch + dy * sens() * inv(), -0.7, 0.7);
        return;
      }
      st.current.yaw -= dx * sens();
      if (m === 'first') st.current.pitch = THREE.MathUtils.clamp(st.current.pitch + dy * sens() * inv(), -1.35, 1.35);
      else st.current.pitch = THREE.MathUtils.clamp(st.current.pitch + dy * sens() * inv(), -0.25, 1.25);
    };
    const onUp = (e: PointerEvent) => {
      st.current.dragging = false;
      el.releasePointerCapture?.(e.pointerId);
    };
    const onWheel = (e: WheelEvent) => {
      if (useGame.getState().cameraMode !== 'third') return;
      st.current.dist = THREE.MathUtils.clamp(st.current.dist * (1 + Math.sign(e.deltaY) * 0.1), 1.4, 10);
    };
    const onLock = () => useGame.getState().set({ pointerLocked: document.pointerLockElement === el });
    const onContext = (e: Event) => e.preventDefault();
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('contextmenu', onContext);
    document.addEventListener('pointerlockchange', onLock);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', onContext);
      document.removeEventListener('pointerlockchange', onLock);
    };
  }, [gl]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const L = runtime.local;
    const s = st.current;
    const m = useGame.getState().cameraMode;
    const h = runtime.localHeight / 1.72;
    const seated = useGame.getState().seatPhase === 'seated' || useGame.getState().seatPhase === 'sitting';
    const desiredPos = new THREE.Vector3();
    const desiredTarget = new THREE.Vector3();

    if (m === 'third') {
      runtime.camYaw = s.yaw;
      const head = new THREE.Vector3(L.pos.x, L.pos.y + (seated ? 1.15 : 1.55) * h, L.pos.z);
      const f = new THREE.Vector3(Math.sin(s.yaw), 0, Math.cos(s.yaw));
      const dir = new THREE.Vector3(-f.x * Math.cos(s.pitch), Math.sin(s.pitch), -f.z * Math.cos(s.pitch)).normalize();
      let dist = s.dist;
      // Camera collision (walls, glass, furniture) — ignore our own body and other avatars.
      const ray = new rapier.Ray(head, dir);
      const hit = world.castRay(ray, dist + 0.3, true, undefined, undefined, undefined, runtime.localBody as never, (c) => !runtime.remoteColliders.has(c.handle));
      if (hit) dist = Math.max(0.35, Math.min(dist, hit.timeOfImpact - 0.25));
      desiredPos.copy(head).addScaledVector(dir, dist);
      desiredTarget.copy(head).addScaledVector(new THREE.Vector3(-f.z, 0, f.x), 0.0);
    } else if (m === 'first') {
      runtime.camYaw = s.yaw;
      const eye = (seated ? 1.18 : EYE_HEIGHT) * h;
      desiredPos.set(L.pos.x, L.pos.y + eye, L.pos.z).addScaledVector(new THREE.Vector3(Math.sin(s.yaw), 0, Math.cos(s.yaw)), 0.12);
      desiredTarget.copy(desiredPos).add(new THREE.Vector3(Math.sin(s.yaw) * Math.cos(s.pitch), -Math.sin(s.pitch), Math.cos(s.yaw) * Math.cos(s.pitch)));
    } else if (preset && presetDir) {
      const yaw = presetDir.yaw + s.pyaw;
      const pitch = THREE.MathUtils.clamp(presetDir.pitch + s.ppitch, -1.4, 1.4);
      desiredPos.set(...preset.position);
      desiredTarget.copy(desiredPos).add(new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(10));
    } else if (preset) {
      desiredPos.set(...preset.position);
      desiredTarget.set(...preset.target);
    }

    const tr = trans.current;
    if (tr) {
      tr.t = Math.min(1, tr.t + dt / 0.9);
      const k = tr.t < 0.5 ? 4 * tr.t ** 3 : 1 - (-2 * tr.t + 2) ** 3 / 2;
      camera.position.lerpVectors(tr.fromPos, desiredPos, k);
      lookTarget.current.lerpVectors(tr.fromTarget, desiredTarget, k);
      camera.lookAt(lookTarget.current);
      if (tr.t >= 1) {
        trans.current = null;
        if (m === 'overview' && preset && controls.current) {
          controls.current.target.set(...preset.target);
          controls.current.update();
        }
        orbitReady.current = true;
      }
    } else if (m === 'preset') {
      camera.position.copy(desiredPos);
      lookTarget.current.lerp(desiredTarget, 1 - Math.exp(-dt * 12));
      camera.lookAt(lookTarget.current);
    } else if (m === 'third' || m === 'first') {
      // Slight positional smoothing in third person for comfort.
      if (m === 'third') camera.position.lerp(desiredPos, 1 - Math.exp(-dt * 18));
      else camera.position.copy(desiredPos);
      lookTarget.current.copy(desiredTarget);
      camera.lookAt(lookTarget.current);
    } else if (controls.current) {
      lookTarget.current.copy(controls.current.target);
    }

    // Spatial-audio listener follows the avatar (not a detached observation camera).
    runtime.listenerPos.set(L.pos.x, L.pos.y + 1.55 * h, L.pos.z);
    camera.getWorldDirection(tmpV);
    if (m === 'overview' || m === 'preset') tmpV.set(Math.sin(L.rotY), 0, Math.cos(L.rotY));
    runtime.listenerForward.copy(tmpV.setY(0).normalize());
  });

  return mode === 'overview' && preset ? <OrbitRig key="overview" controls={controls} target={preset.target} overview trans={trans} /> : null;
}

/** OrbitControls that stay disabled while a camera transition is animating. */
function OrbitRig({ controls, target, overview, trans }: { controls: React.MutableRefObject<OrbitControlsImpl | null>; target: [number, number, number]; overview: boolean; trans: React.MutableRefObject<unknown> }) {
  useFrame(() => {
    if (controls.current) controls.current.enabled = !trans.current;
  }, -2);
  return (
    <OrbitControls
      ref={controls}
      makeDefault={false}
      target={target}
      enableDamping
      dampingFactor={0.08}
      enablePan={overview}
      enableZoom={overview}
      minDistance={overview ? 8 : 1.1}
      maxDistance={overview ? 90 : 1.3}
      maxPolarAngle={overview ? Math.PI / 2.1 : Math.PI * 0.95}
    />
  );
}
