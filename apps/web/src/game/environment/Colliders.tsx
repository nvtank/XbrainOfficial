/** Physics colliders generated from the shared layout (same data the server validates against). */
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody, type RapierCollider } from '@react-three/rapier';
import { CEILING_HEIGHT, DOORS, ENTRANCE_DOOR, OBSTACLES, doorClosedRect, type DoorDef } from '@xbrain/shared';
import { useWorld } from '../../stores/world';
import { runtime } from '../runtime';

function DoorCollider({ d }: { d: DoorDef }) {
  const ref = useRef<RapierCollider>(null);
  const open = useWorld((s) => (s.objects[d.id] ?? 0) > 0);
  const r = doorClosedRect(d);
  useEffect(() => {
    ref.current?.setEnabled(!open);
  }, [open]);
  return (
    <CuboidCollider
      ref={ref}
      args={[(r.maxX - r.minX) / 2, 1.1, (r.maxZ - r.minZ) / 2]}
      position={[(r.minX + r.maxX) / 2, 1.1, (r.minZ + r.maxZ) / 2]}
    />
  );
}

function EntranceCollider() {
  const ref = useRef<RapierCollider>(null);
  const last = useRef<boolean | null>(null);
  useFrame(() => {
    const closed = runtime.entranceOpen < 0.6;
    if (closed !== last.current && ref.current) {
      ref.current.setEnabled(closed);
      last.current = closed;
    }
  });
  return <CuboidCollider ref={ref} args={[ENTRANCE_DOOR.width / 2, ENTRANCE_DOOR.height / 2, 0.06]} position={[0, ENTRANCE_DOOR.height / 2, ENTRANCE_DOOR.z]} />;
}

export function Colliders() {
  return (
    <RigidBody type="fixed" colliders={false}>
      {/* Floor & ceiling */}
      <CuboidCollider args={[40, 0.1, 40]} position={[0, -0.1, -8]} />
      <CuboidCollider args={[40, 0.1, 40]} position={[0, CEILING_HEIGHT + 0.1, -8]} />
      {OBSTACLES.map((o) => (
        <CuboidCollider
          key={o.id}
          args={[(o.rect.maxX - o.rect.minX) / 2, (o.y1 - o.y0) / 2, (o.rect.maxZ - o.rect.minZ) / 2]}
          position={[(o.rect.minX + o.rect.maxX) / 2, (o.y0 + o.y1) / 2, (o.rect.minZ + o.rect.maxZ) / 2]}
        />
      ))}
      {DOORS.map((d) => (
        <DoorCollider key={d.id} d={d} />
      ))}
      <EntranceCollider />
    </RigidBody>
  );
}
