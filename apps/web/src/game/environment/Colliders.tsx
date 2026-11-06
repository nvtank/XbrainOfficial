/** Physics colliders generated from the shared layout (same data the server validates against). */
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody, type RapierCollider } from '@react-three/rapier';
import { CEILING_HEIGHT, DOORS, ENTRANCE_DOOR, OBSTACLES, doorClosedRect, doorOpenRect, type DoorDef } from '@xbrain/shared';
import { useWorld } from '../../stores/world';
import { runtime } from '../runtime';

/** Door leaf collider: blocks the doorway when closed, and the swung-open leaf when open (no walking through glass). */
function DoorCollider({ d }: { d: DoorDef }) {
  const closedRef = useRef<RapierCollider>(null);
  const openRef = useRef<RapierCollider>(null);
  const open = useWorld((s) => (s.objects[d.id] ?? 0) > 0);
  const c = doorClosedRect(d);
  const o = doorOpenRect(d);
  useEffect(() => {
    closedRef.current?.setEnabled(!open);
    openRef.current?.setEnabled(open);
  }, [open]);
  return (
    <>
      <CuboidCollider ref={closedRef} args={[(c.maxX - c.minX) / 2, 1.15, (c.maxZ - c.minZ) / 2]} position={[(c.minX + c.maxX) / 2, 1.15, (c.minZ + c.maxZ) / 2]} />
      <CuboidCollider ref={openRef} args={[(o.maxX - o.minX) / 2, 1.15, (o.maxZ - o.minZ) / 2]} position={[(o.minX + o.maxX) / 2, 1.15, (o.minZ + o.maxZ) / 2]} />
    </>
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
