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
/** Chibi avatar height (big head, small body). */
export const AVATAR_HEIGHT = 1.23;
export const WALK_SPEED = 2.6;
export const RUN_SPEED = 5.6;
/** Server-side tolerance multiplier for movement validation. */
export const SPEED_TOLERANCE = 1.45;
export const JUMP_VELOCITY = 4.2;
export const GRAVITY = 12;
export const EYE_HEIGHT = 1.0;

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

/**
 * Emotes = facial expression + optional body animation. The first ten are bound to
 * keys 1…9, 0. Face and body layers blend independently (walking keeps the face).
 */
export const EMOTES = ['smile', 'laugh', 'cry', 'sad', 'angry', 'surprised', 'happy', 'think', 'wave', 'clap', 'greet', 'cheer', 'thumbsup', 'dance'] as const;
export type EmoteName = (typeof EMOTES)[number];
export type FaceExpression = 'neutral' | 'smile' | 'laugh' | 'cry' | 'sad' | 'angry' | 'surprised' | 'happy' | 'think' | 'talk';
export type BodyEmote = 'laugh' | 'cry' | 'sad' | 'angry' | 'surprised' | 'happy' | 'think' | 'wave' | 'clap' | 'bow' | 'cheer' | 'thumbsup' | 'dance';

export const EMOTE_LABELS: Record<EmoteName, string> = {
  smile: 'Smile', laugh: 'Laugh', cry: 'Cry', sad: 'Sad', angry: 'Angry', surprised: 'Surprised', happy: 'Happy',
  think: 'Thinking', wave: 'Wave', clap: 'Clap', greet: 'Greet', cheer: 'Cheer', thumbsup: 'Thumbs up', dance: 'Dance',
};
export const EMOTE_ICONS: Record<EmoteName, string> = {
  smile: '😊', laugh: '😂', cry: '😭', sad: '😢', angry: '😠', surprised: '😮', happy: '😄',
  think: '🤔', wave: '👋', clap: '👏', greet: '🙇', cheer: '🙌', thumbsup: '👍', dance: '💃',
};
export const EMOTE_FACE: Record<EmoteName, FaceExpression> = {
  smile: 'smile', laugh: 'laugh', cry: 'cry', sad: 'sad', angry: 'angry', surprised: 'surprised', happy: 'happy',
  think: 'think', wave: 'smile', clap: 'happy', greet: 'smile', cheer: 'happy', thumbsup: 'smile', dance: 'happy',
};
export const EMOTE_BODY: Record<EmoteName, BodyEmote | null> = {
  smile: null, laugh: 'laugh', cry: 'cry', sad: 'sad', angry: 'angry', surprised: 'surprised', happy: 'happy',
  think: 'think', wave: 'wave', clap: 'clap', greet: 'bow', cheer: 'cheer', thumbsup: 'thumbsup', dance: 'dance',
};
export const EMOTE_DURATION_MS: Record<EmoteName, number> = {
  smile: 4000, laugh: 3600, cry: 4600, sad: 4200, angry: 3600, surprised: 2600, happy: 3600,
  think: 4000, wave: 2400, clap: 2600, greet: 2100, cheer: 2600, thumbsup: 2200, dance: 6000,
};
/** Keyboard shortcuts: Digit1 … Digit0 → the first ten emotes. */
export const EMOTE_HOTKEYS: Array<[string, EmoteName]> = EMOTES.slice(0, 10).map((e, i) => [`Digit${(i + 1) % 10}`, e]);

/** Simple chat text → expression triggers (e.g. "haha" makes you laugh). */
export const CHAT_EMOTE_TRIGGERS: Array<[RegExp, EmoteName]> = [
  [/(haha|hihi|kkk|lol|:d|xd|😂|🤣)/i, 'laugh'],
  [/(t_t|;\(|:'\(|😭|huhu)/i, 'cry'],
  [/(:\(|😢|buồn)/i, 'sad'],
  [/(😠|😡|grr|>:\()/i, 'angry'],
  [/(wow|😮|😲|omg)/i, 'surprised'],
  [/(:\)|😊|🙂)/i, 'smile'],
  [/(🤔|hmm)/i, 'think'],
  [/(👋|hello|xin chào|chào)/i, 'wave'],
];

export const BRAND = {
  orange: '#F7941D',
  orangeDeep: '#E5622A',
  yellow: '#F9B33F',
  black: '#14161A',
} as const;
