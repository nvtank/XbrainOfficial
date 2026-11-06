/**
 * Local player: Rapier kinematic character controller (walls, furniture, other
 * avatars), acceleration/deceleration, jump, run, sit/stand transitions and
 * 15 Hz transform uploads to the authoritative server.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import {
  AnimCode,
  AVATAR_HEIGHT,
  AVATAR_RADIUS,
  CLIENT_SEND_HZ,
  DEFAULT_AVATAR,
  GRAVITY,
  JUMP_VELOCITY,
  RUN_SPEED,
  SEAT_BY_ID,
  SPAWN,
  WALK_SPEED,
} from '@xbrain/shared';
import { useApp } from '../../stores/app';
import { useGame } from '../../stores/game';
import { useSettings } from '../../stores/settings';
import { useWorld } from '../../stores/world';
import { useChat } from '../../stores/chat';
import { useVoiceStore } from '../../stores/voice';
import { input } from '../controls/input';
import { runtime } from '../runtime';
import { net } from '../../services/network';
import { formatHMS, workElapsed } from '../../services/clock';
import { AvatarEntity } from './AvatarEntity';
import type { Loco } from './animator';

const CAPSULE_HALF = 0.33;

function dampAngle(a: number, b: number, lambda: number, dt: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
}

interface Tween {
  from: THREE.Vector3;
  to: THREE.Vector3;
  fromRot: number;
  toRot: number;
  t: number;
  dur: number;
  done: () => void;
}

export function LocalPlayer() {
  const selfSid = useWorld((s) => s.selfSid);
  const me = useWorld((s) => (s.selfSid ? s.players[s.selfSid] : undefined));
  const fallbackAvatar = useApp((s) => s.user?.avatar);
  const cfg = me?.avatar ?? fallbackAvatar ?? DEFAULT_AVATAR;
  const quality = useSettings((s) => s.quality);
  const entity = useMemo(() => new AvatarEntity(cfg, { castShadow: quality === 'high' }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const meRef = useRef(me);
  meRef.current = me;

  useEffect(() => entity.setConfig(cfg), [entity, cfg]);
  useEffect(() => entity.setShadow(quality === 'high'), [entity, quality]);
  useEffect(() => () => entity.dispose(), [entity]);
  useEffect(() => {
    runtime.localHeight = AVATAR_HEIGHT * cfg.height;
  }, [cfg.height]);

  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const { world, rapier } = useRapier();
  const controller = useMemo(() => {
    const c = world.createCharacterController(0.02);
    c.enableAutostep(0.22, 0.25, false);
    c.enableSnapToGround(0.3);
    c.setSlideEnabled(true);
    c.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    c.setApplyImpulsesToDynamicBodies(false);
    return c;
  }, [world]);
  useEffect(() => () => world.removeCharacterController(controller), [world, controller]);

  const vel = useRef(new THREE.Vector3());
  const vy = useRef(0);
  const jumpQueued = useRef(false);
  const tween = useRef<Tween | null>(null);
  const sendAcc = useRef(0);
  const last = useRef({ x: 0, y: 0, z: 0, r: 0, a: -1, t: 0 });
  const prevRot = useRef(runtime.local.rotY);

  useEffect(() => input.onPress('jump', () => (jumpQueued.current = true)), []);

  // React to seat state changes coming from the server.
  useEffect(
    () =>
      useGame.subscribe((s, prev) => {
        if (s.seatPhase === prev.seatPhase && s.seatId === prev.seatId) return;
        const seat = s.seatId ? SEAT_BY_ID[s.seatId] : undefined;
        if (s.seatPhase === 'sitting' && seat) {
          tween.current = {
            from: runtime.local.pos.clone(),
            to: new THREE.Vector3(seat.x, Math.max(0, seat.seatHeight - 0.47), seat.z),
            fromRot: runtime.local.rotY,
            toRot: seat.rotY,
            t: 0,
            dur: 0.55,
            done: () => useGame.getState().set({ seatPhase: 'seated' }),
          };
          vel.current.set(0, 0, 0);
          runtime.local.emote = null;
        } else if (s.seatPhase === 'standing' && seat) {
          tween.current = {
            from: runtime.local.pos.clone(),
            to: new THREE.Vector3(seat.stand.x, 0, seat.stand.z),
            fromRot: runtime.local.rotY,
            toRot: seat.rotY,
            t: 0,
            dur: 0.5,
            done: () => {
              useGame.getState().set({ seatPhase: 'none', seatId: null });
              last.current.a = -1; // force an immediate transform upload
            },
          };
        } else if (s.seatPhase === 'seated' && seat && !tween.current) {
          // Restored after reconnect → snap into the seat.
          runtime.local.pos.set(seat.x, Math.max(0, seat.seatHeight - 0.47), seat.z);
          runtime.local.rotY = seat.rotY;
          body.current?.setTranslation(runtime.local.pos, true);
        }
      }),
    [],
  );

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const L = runtime.local;
    const g = useGame.getState();
    const settings = useSettings.getState();
    const rb = body.current;
    const col = collider.current;
    if (!rb || !col) return;
    runtime.localBody = rb;

    // Server correction / teleport
    if (L.teleport) {
      const t = L.teleport;
      L.teleport = null;
      if (g.seatPhase === 'none') {
        L.pos.set(t.x, t.y, t.z);
        if (t.rotY !== undefined) {
          L.rotY = t.rotY;
          runtime.camYaw = t.rotY;
        }
        rb.setTranslation(L.pos, true);
        vel.current.set(0, 0, 0);
        vy.current = 0;
      }
    }

    const seat = g.seatId ? SEAT_BY_ID[g.seatId] : undefined;
    let loco: Loco = 'idle';
    let speed = 0;

    if (tween.current) {
      // Sit-down / stand-up transition
      const tw = tween.current;
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const k = tw.t * tw.t * (3 - 2 * tw.t);
      L.pos.lerpVectors(tw.from, tw.to, k);
      L.rotY = dampAngle(L.rotY, tw.toRot, 14, dt);
      rb.setNextKinematicTranslation(L.pos);
      loco = g.seatPhase === 'sitting' ? (seat?.kind === 'desk' ? 'type' : 'sit') : 'idle';
      if (tw.t >= 1) {
        tween.current = null;
        tw.done();
      }
    } else if (g.seatPhase === 'seated') {
      loco = seat?.kind === 'desk' ? 'type' : 'sit';
      if (seat) L.rotY = dampAngle(L.rotY, seat.rotY, 10, dt);
      rb.setNextKinematicTranslation(L.pos);
    } else {
      // Free movement
      const blocked = g.anyModal() || g.cameraMode === 'overview' || g.cameraMode === 'preset' || g.seatPhase !== 'none';
      let ix = 0;
      let iz = 0;
      if (!blocked) {
        if (input.isDown('forward')) iz += 1;
        if (input.isDown('back')) iz -= 1;
        if (input.isDown('left')) ix -= 1;
        if (input.isDown('right')) ix += 1;
      }
      const yaw = runtime.camYaw;
      const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const right = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
      const wish = new THREE.Vector3().addScaledVector(fwd, iz).addScaledVector(right, ix);
      const running = input.isDown('run');
      const maxSpeed = running ? RUN_SPEED : WALK_SPEED;
      if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(maxSpeed);
      const accel = wish.lengthSq() > 0 ? 9 : 12;
      vel.current.x = THREE.MathUtils.damp(vel.current.x, wish.x, accel, dt);
      vel.current.z = THREE.MathUtils.damp(vel.current.z, wish.z, accel, dt);

      const t = rb.translation();
      const grounded0 = controller.computedGrounded();
      if (jumpQueued.current && !blocked && (grounded0 || t.y < 0.02)) vy.current = JUMP_VELOCITY;
      jumpQueued.current = false;
      vy.current -= GRAVITY * dt;

      const desired = { x: vel.current.x * dt, y: vy.current * dt, z: vel.current.z * dt };
      const avatarCollision = settings.avatarCollision;
      controller.computeColliderMovement(col, desired, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, (c) => avatarCollision || !runtime.remoteColliders.has(c.handle));
      const mv = controller.computedMovement();
      const grounded = controller.computedGrounded();
      if (grounded && vy.current < 0) vy.current = 0;
      const next = new THREE.Vector3(t.x + mv.x, Math.max(0, t.y + mv.y), t.z + mv.z);
      rb.setNextKinematicTranslation(next);
      const realVel = Math.hypot(mv.x, mv.z) / Math.max(dt, 1e-4);
      // Feed the actual (collision-resolved) velocity back so we don't accumulate into walls.
      if (realVel < Math.hypot(vel.current.x, vel.current.z) * 0.5) vel.current.multiplyScalar(0.6);
      L.pos.copy(next);
      L.grounded = grounded;
      speed = Math.min(realVel, RUN_SPEED * 1.2);

      if (g.cameraMode === 'first') L.rotY = runtime.camYaw;
      else if (speed > 0.25) L.rotY = dampAngle(L.rotY, Math.atan2(vel.current.x, vel.current.z), 12, dt);

      const turnRate = Math.abs(L.rotY - prevRot.current) / Math.max(dt, 1e-4);
      if (!grounded && vy.current > 0.5) loco = 'jump';
      else if (speed > WALK_SPEED * 1.25) loco = 'run';
      else if (speed > 0.3) loco = 'walk';
      else if (turnRate > 2.5) loco = 'turn';
    }
    prevRot.current = L.rotY;
    L.speed = speed;
    L.anim = { idle: AnimCode.Idle, walk: AnimCode.Walk, run: AnimCode.Run, jump: AnimCode.Jump, sit: AnimCode.Sit, type: AnimCode.Type, turn: AnimCode.Turn }[loco];

    // Render the avatar
    const now = performance.now();
    if (L.emote && L.emote.until < now) L.emote = null;
    const sid = useWorld.getState().selfSid;
    const speaking = !!(sid && useWorld.getState().speaking[sid]);
    entity.group.position.copy(L.pos);
    entity.group.rotation.y = L.rotY;
    entity.update(dt, { loco, speed, emote: L.emote?.name ?? null, talking: speaking || L.talkingUntil > now });
    const firstPerson = g.cameraMode === 'first';
    entity.setMeshVisible(!firstPerson);
    const p = meRef.current;
    const bubble = sid ? useChat.getState().bubbles[sid] : undefined;
    entity.setBubble(!firstPerson && bubble && bubble.until > now ? bubble.text : null);
    entity.setPlate(
      firstPerson || !p
        ? null
        : {
            name: p.name,
            self: true,
            working: p.working,
            timer: p.working ? formatHMS(workElapsed(p)) : '',
            micOn: useVoiceStore.getState().micOn,
            speaking,
            muted: p.muted,
            offline: g.connection !== 'connected',
            status: '',
          },
    );

    // Upload transform at 15 Hz (only when changed; 1 Hz heartbeat otherwise)
    sendAcc.current += rawDt;
    if (sendAcc.current >= 1 / CLIENT_SEND_HZ && g.seatPhase === 'none' && !tween.current && g.connection === 'connected') {
      sendAcc.current = 0;
      const l = last.current;
      const changed = Math.abs(l.x - L.pos.x) > 0.01 || Math.abs(l.z - L.pos.z) > 0.01 || Math.abs(l.y - L.pos.y) > 0.01 || Math.abs(l.r - L.rotY) > 0.02 || l.a !== L.anim;
      if (changed || state.clock.elapsedTime - l.t > 1) {
        net.sendMove(L.pos.x, L.pos.y, L.pos.z, L.rotY, L.anim);
        Object.assign(l, { x: L.pos.x, y: L.pos.y, z: L.pos.z, r: L.rotY, a: L.anim, t: state.clock.elapsedTime });
      }
    }
  });

  if (!selfSid) return null;
  return (
    <>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[runtime.local.pos.x || SPAWN.x, runtime.local.pos.y, runtime.local.pos.z || SPAWN.z]} enabledRotations={[false, false, false]}>
        <CapsuleCollider ref={collider} args={[CAPSULE_HALF, AVATAR_RADIUS]} position={[0, CAPSULE_HALF + AVATAR_RADIUS, 0]} />
      </RigidBody>
      <primitive object={entity.group} />
    </>
  );
}
