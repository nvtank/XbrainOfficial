/** Global gameplay / networking constants shared by client and server. */

export const OFFICE_CAPACITY = 50;
export const DEFAULT_OFFICE_ID = 'xbrain-danang';
export const DEFAULT_OFFICE_NAME = 'XBrain Đà Nẵng';
export const ROOM_NAME = 'office';

/** Server simulation / snapshot tick (Hz). */
export const SERVER_TICK_HZ = 15;
/** Client → server transform send rate (Hz). */
export const CLIENT_SEND_HZ = 15;
/** Interpolation delay for remote avatars (ms). */
export const INTERP_DELAY_MS = 120;
/** Players inside this radius receive each other's transforms every tick; others at a lower rate. */
export const INTEREST_RADIUS = 28;
/** Far players are sent every N ticks. */
export const FAR_PLAYER_TICK_DIVISOR = 4;
/** Seconds a disconnected player's seat & session are kept for reconnection. */
export const RECONNECT_GRACE_SECONDS = 45;

export const AVATAR_RADIUS = 0.28;
export const AVATAR_HEIGHT = 1.72;
export const WALK_SPEED = 2.6;
export const RUN_SPEED = 5.6;
/** Server-side tolerance multiplier for movement validation. */
export const SPEED_TOLERANCE = 1.45;
export const JUMP_VELOCITY = 4.2;
export const GRAVITY = 12;
export const EYE_HEIGHT = 1.6;

export const INTERACT_RANGE = 1.8;
export const SEAT_RANGE = 2.2;

export const CHAT_MAX_LENGTH = 300;
export const CHAT_RATE_WINDOW_MS = 6000;
export const CHAT_RATE_MAX = 6;
export const NEARBY_CHAT_RADIUS = 10;
export const SPEECH_BUBBLE_MS = 6000;
export const NAME_MAX_LENGTH = 24;
export const WHITEBOARD_MAX_LENGTH = 1200;

/** Proximity voice distance bands (meters). Configurable from the settings panel. */
export interface VoiceRanges {
  /** Full volume up to this distance. */
  full: number;
  /** Volume fades from 1 → `midGain` until this distance. */
  mid: number;
  /** Volume fades from `midGain` → `farGain` until this distance, then silence. */
  far: number;
  midGain: number;
  farGain: number;
}
export const DEFAULT_VOICE_RANGES: VoiceRanges = { full: 3, mid: 7, far: 12, midGain: 0.35, farGain: 0.06 };
/** Subscribe to a speaker's audio track when closer than far + margin (hysteresis on unsubscribe). */
export const VOICE_SUBSCRIBE_MARGIN = 2;
export const VOICE_UNSUBSCRIBE_MARGIN = 5;

/** Gain multiplier when listener & speaker are separated by a closed room wall. */
export const WALL_OCCLUSION_GAIN = 0.06;
/** Gain multiplier through an open door. */
export const OPEN_DOOR_OCCLUSION_GAIN = 0.3;

/** Animation state codes sent over the network (compact). */
export enum AnimCode {
  Idle = 0,
  Walk = 1,
  Run = 2,
  Jump = 3,
  Sit = 4,
  Type = 5,
  Turn = 6,
}

export const EMOTES = ['wave', 'clap', 'thumbsup', 'cheer', 'think', 'bow', 'dance'] as const;
export type EmoteName = (typeof EMOTES)[number];
export const EMOTE_LABELS: Record<EmoteName, string> = {
  wave: 'Wave',
  clap: 'Clap',
  thumbsup: 'Thumbs up',
  cheer: 'Cheer',
  think: 'Think',
  bow: 'Bow',
  dance: 'Dance',
};
export const EMOTE_ICONS: Record<EmoteName, string> = {
  wave: '👋',
  clap: '👏',
  thumbsup: '👍',
  cheer: '🙌',
  think: '🤔',
  bow: '🙇',
  dance: '💃',
};
export const EMOTE_DURATION_MS: Record<EmoteName, number> = {
  wave: 2400,
  clap: 2400,
  thumbsup: 1800,
  cheer: 2200,
  think: 3000,
  bow: 2000,
  dance: 6000,
};

export const BRAND = {
  orange: '#F7941D',
  orangeDeep: '#E5622A',
  yellow: '#F9B33F',
  black: '#14161A',
} as const;
