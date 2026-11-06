/**
 * Reusable proximity interaction system: finds the best interactable in front of
 * the local avatar, shows a prompt + highlight, and dispatches E / F actions.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { INTERACTABLES, SEAT_BY_ID, type InteractableDef } from '@xbrain/shared';
import { useGame, type InteractPrompt } from '../../stores/game';
import { useSettings, keyLabel } from '../../stores/settings';
import { useWorld } from '../../stores/world';
import { input } from '../controls/input';
import { runtime } from '../runtime';
import { net } from '../../services/network';

let focused: InteractableDef | null = null;

function verbFor(def: InteractableDef, objects: Record<string, number>): string {
  const v = objects[def.id] ?? 0;
  switch (def.kind) {
    case 'door':
      return v ? 'CLOSE DOOR' : 'OPEN DOOR';
    case 'toggle':
      return def.id.startsWith('filecab') ? (v ? 'CLOSE DRAWER' : 'OPEN DRAWER') : v ? 'CLOSE' : 'OPEN';
    case 'lamp':
      return v ? 'TURN LIGHT OFF' : 'TURN LIGHT ON';
    case 'tv':
      return v ? 'TURN TV OFF' : 'TURN TV ON';
    default:
      return def.verb;
  }
}

function computePrompt(): { prompt: InteractPrompt | null; def: InteractableDef | null } {
  const g = useGame.getState();
  const keys = useSettings.getState().keys;
  const E = keyLabel(keys.interact);
  const F = keyLabel(keys.secondary);
  if (g.cameraMode === 'overview' || g.cameraMode === 'preset') return { prompt: null, def: null };
  if (g.seatPhase === 'seated' && g.seatId) {
    const seat = SEAT_BY_ID[g.seatId];
    return {
      prompt: { id: `seat:${g.seatId}`, label: seat?.label ?? 'Seat', verb: 'STAND UP', key: E, secondary: seat?.hasComputer ? { verb: 'USE COMPUTER', key: F } : undefined },
      def: null,
    };
  }
  if (g.seatPhase !== 'none') return { prompt: null, def: null };
  const L = runtime.local;
  const fx = Math.sin(L.rotY);
  const fz = Math.cos(L.rotY);
  const { seats, objects, players, selfSid } = useWorld.getState();
  let best: InteractableDef | null = null;
  let bestScore = Infinity;
  for (const it of INTERACTABLES) {
    const dx = it.x - L.pos.x;
    const dz = it.z - L.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > it.radius) continue;
    const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
    if (facing < -0.35 && d > 0.8) continue;
    const score = d + (1 - facing) * 0.6 + (it.kind === 'seat' ? 0.15 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = it;
    }
  }
  if (!best) return { prompt: null, def: null };
  const prompt: InteractPrompt = { id: best.id, label: best.label, verb: verbFor(best, objects), key: E };
  if (best.kind === 'seat' && best.seatId) {
    const occ = seats[best.seatId];
    if (occ && occ !== selfSid) prompt.disabled = `Occupied by ${players[occ]?.name ?? 'someone'}`;
  }
  if (best.kind === 'tv' && (objects[best.id] ?? 0) > 0) prompt.secondary = { verb: 'NEXT SLIDE', key: F };
  return { prompt, def: best };
}

export function InteractionSystem() {
  const acc = useRef(0);
  const ring = useRef<THREE.Mesh>(null!);
  const marker = useRef<THREE.Mesh>(null!);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#F7941D', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }), []);

  useEffect(() => {
    const offE = input.onPress('interact', () => {
      const g = useGame.getState();
      if (g.anyModal()) return;
      if (g.seatPhase === 'seated') {
        net.stand();
        return;
      }
      const def = focused;
      if (!def || g.seatPhase !== 'none' || g.prompt?.disabled) return;
      switch (def.kind) {
        case 'seat':
          if (def.seatId) net.sit(def.seatId);
          break;
        case 'whiteboard':
          g.set({ whiteboardOpen: def.id });
          break;
        case 'checkin':
          g.set({ checkin: { phase: 'scanning' } });
          break;
        case 'view':
          g.setCamera('preset', 'bridge');
          g.toast('info', 'Thuận Phước Bridge view — press C to return to your avatar.');
          break;
        default:
          net.interact(def.id);
      }
    });
    const offF = input.onPress('secondary', () => {
      const g = useGame.getState();
      if (g.anyModal()) return;
      if (g.seatPhase === 'seated' && g.seatId && SEAT_BY_ID[g.seatId]?.hasComputer) {
        g.set({ computerOpen: true });
        return;
      }
      if (focused?.kind === 'tv') net.interact(focused.id, 'next');
    });
    return () => {
      offE();
      offF();
    };
  }, []);

  useFrame(({ clock }, dt) => {
    acc.current += dt;
    if (acc.current > 0.1) {
      acc.current = 0;
      const { prompt, def } = computePrompt();
      focused = def;
      const cur = useGame.getState().prompt;
      if (JSON.stringify(cur) !== JSON.stringify(prompt)) useGame.getState().set({ prompt });
    }
    const def = focused;
    ring.current.visible = !!def;
    marker.current.visible = !!def;
    if (def) {
      const pulse = 1 + Math.sin(clock.elapsedTime * 5) * 0.08;
      ring.current.position.set(def.x, 0.03, def.z);
      ring.current.scale.setScalar(pulse * (def.kind === 'seat' ? 0.9 : 1.1));
      marker.current.position.set(def.x, (def.kind === 'seat' ? 1.25 : def.y + 0.45) + Math.sin(clock.elapsedTime * 3) * 0.05, def.z);
      marker.current.rotation.y += dt * 2;
      ringMat.color.set(useGame.getState().prompt?.disabled ? '#ef4444' : '#F7941D');
    }
  });

  return (
    <group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} material={ringMat} renderOrder={5}>
        <ringGeometry args={[0.36, 0.46, 40]} />
      </mesh>
      <mesh ref={marker} material={ringMat} renderOrder={5}>
        <octahedronGeometry args={[0.07, 0]} />
      </mesh>
    </group>
  );
}
