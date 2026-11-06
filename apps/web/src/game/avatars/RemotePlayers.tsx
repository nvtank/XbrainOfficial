/** Remote avatars: snapshot interpolation, animation from synced state, nameplates, kinematic colliders. */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { AnimCode, AVATAR_RADIUS } from '@xbrain/shared';
import { useWorld, type PlayerView } from '../../stores/world';
import { useChat } from '../../stores/chat';
import { useSettings } from '../../stores/settings';
import { runtime } from '../runtime';
import { formatHMS, workElapsed } from '../../services/clock';
import { AvatarEntity } from './AvatarEntity';
import type { Loco } from './animator';

const CODE_TO_LOCO: Record<number, Loco> = {
  [AnimCode.Idle]: 'idle',
  [AnimCode.Walk]: 'walk',
  [AnimCode.Run]: 'run',
  [AnimCode.Jump]: 'jump',
  [AnimCode.Sit]: 'sit',
  [AnimCode.Type]: 'type',
  [AnimCode.Turn]: 'turn',
};

function RemoteAvatar({ sid }: { sid: string }) {
  // Keep the last known view so a removal never renders an undefined player before unmount.
  const lastP = useRef<PlayerView | null>(null);
  const cur = useWorld((s) => s.players[sid]);
  if (cur) lastP.current = cur;
  const p = lastP.current!;
  const quality = useSettings((s) => s.quality);
  const entity = useMemo(() => new AvatarEntity(p.avatar, { castShadow: quality === 'high' }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const pRef = useRef(p);
  pRef.current = p;
  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const rot = useRef(0);
  const initialized = useRef(false);
  const sample = useMemo(() => ({ x: 0, y: 0, z: 0, r: 0, a: 0, speed: 0 }), []);

  useEffect(() => entity.setConfig(p.avatar), [entity, p.avatar]);
  useEffect(() => entity.setShadow(quality === 'high'), [entity, quality]);
  useEffect(() => {
    runtime.remotePos.set(sid, pos);
    return () => {
      runtime.remotePos.delete(sid);
      entity.dispose();
    };
  }, [sid, pos, entity]);
  useEffect(() => {
    const h = collider.current?.handle;
    if (h === undefined) return;
    runtime.remoteColliders.add(h);
    return () => void runtime.remoteColliders.delete(h);
  });

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const pl = pRef.current;
    const buf = runtime.buffers.get(pl.idx);
    if (!buf || !buf.sample(sample)) {
      entity.group.visible = false;
      return;
    }
    entity.group.visible = true;
    const target = new THREE.Vector3(sample.x, sample.y, sample.z);
    if (!initialized.current || pos.distanceTo(target) > 4) {
      pos.copy(target);
      rot.current = sample.r;
      initialized.current = true;
    } else {
      // Extra smoothing hides snapshot jitter & sit/stand position jumps.
      const k = 1 - Math.exp(-dt * 14);
      pos.lerp(target, k);
      let d = sample.r - rot.current;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      rot.current += d * (1 - Math.exp(-dt * 12));
    }
    body.current?.setNextKinematicTranslation(pos);
    entity.group.position.copy(pos);
    entity.group.rotation.y = rot.current;

    const now = performance.now();
    const emote = runtime.remoteEmotes.get(sid);
    const speaking = !!useWorld.getState().speaking[sid];
    const bubble = useChat.getState().bubbles[sid];
    const loco = CODE_TO_LOCO[sample.a] ?? 'idle';
    const camDist = state.camera.position.distanceTo(pos);
    const lod = camDist > 32 ? 2 : camDist > 16 ? 1 : 0;
    entity.update(dt, { loco, speed: sample.speed, emote: emote && emote.until > now ? emote.name : null, talking: speaking || (!!bubble && bubble.until > now) }, lod);

    const showNames = useSettings.getState().showNames;
    entity.setPlate(
      showNames && camDist < 45
        ? {
            name: pl.name,
            self: false,
            working: pl.working,
            timer: pl.working ? formatHMS(workElapsed(pl)) : '',
            micOn: pl.micOn,
            speaking,
            muted: pl.muted,
            offline: !pl.online,
            status: !pl.online ? 'Reconnecting…' : '',
          }
        : null,
    );
    entity.setBubble(bubble && bubble.until > now && camDist < 30 ? bubble.text : null);
  });

  return (
    <>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[0, -50, 0]}>
        <CapsuleCollider ref={collider} args={[0.55, AVATAR_RADIUS * 0.9]} position={[0, 0.83, 0]} />
      </RigidBody>
      <primitive object={entity.group} />
    </>
  );
}

export function RemotePlayers() {
  const ids = useWorld((s) => Object.keys(s.players).filter((id) => id !== s.selfSid).join(','));
  const list = ids ? ids.split(',') : [];
  return (
    <>
      {list.map((sid) => (
        <RemoteAvatar key={sid} sid={sid} />
      ))}
    </>
  );
}
