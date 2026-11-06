/**
 * Replicated (slow-changing) room state, delta-encoded by Colyseus.
 * Fast-changing transforms are NOT stored here — they travel in per-client
 * snapshot messages with interest management (see OfficeRoom.tick).
 */
import { MapSchema, Schema, type } from '@colyseus/schema';

export class Player extends Schema {
  /** Compact numeric id used in transform snapshots. */
  @type('uint16') idx = 0;
  @type('string') userId = '';
  @type('string') name = '';
  /** JSON-encoded, server-sanitized AvatarConfig. */
  @type('string') avatar = '';
  @type('string') role = 'member';
  @type('string') seatId = '';
  @type('boolean') working = false;
  /** Server timestamp when the current running work segment started (0 = paused / not working). */
  @type('number') workSegmentStart = 0;
  /** Work time accumulated before the current segment (ms). */
  @type('number') workAccumMs = 0;
  @type('boolean') online = true;
  @type('boolean') micOn = false;
  @type('boolean') muted = false;
  @type('string') zone = 'outside';
  @type('number') joinedAt = 0;
}

/** Today's attendance record (keyed by userId). */
export class AttendanceEntry extends Schema {
  @type('string') userId = '';
  @type('string') name = '';
  @type('number') time = 0;
  @type('boolean') late = false;
}

export class OfficeState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  /** seatId → sessionId */
  @type({ map: 'string' }) seats = new MapSchema<string>();
  /** objectId → state (0/1, slide number or timestamp). */
  @type({ map: 'number' }) objects = new MapSchema<number>();
  /** whiteboardId → text */
  @type({ map: 'string' }) boards = new MapSchema<string>();
  @type('string') officeId = '';
  @type('string') officeName = '';
  @type('uint8') capacity = 50;
  @type('boolean') allowTeleport = false;
  @type('number') serverStartedAt = 0;
  /** Face-ID attendance for the current office-local day. */
  @type({ map: AttendanceEntry }) attendance = new MapSchema<AttendanceEntry>();
  @type('string') attendanceDay = '';
  /** Distinct users seen this week (basis for the "absent" figure). */
  @type('uint16') activeWeek = 0;
  /** Late threshold, minutes after local midnight. */
  @type('uint16') lateAfter = 540;
}
