/** Avatar configuration model, option catalogs, presets and server-side sanitization. */
import { NAME_MAX_LENGTH } from './constants';

export const BODY_TYPES = ['masc', 'fem', 'neutral'] as const;
export const FACE_TYPES = ['friendly', 'calm', 'bright', 'serious', 'cheerful'] as const;
export const HAIR_STYLES = ['short', 'buzz', 'side', 'long', 'bob', 'bun', 'ponytail', 'curly', 'mohawk', 'bald'] as const;
export const TOP_STYLES = ['shirt', 'tshirt', 'polo', 'hoodie', 'blazer'] as const;
export const BOTTOM_STYLES = ['pants', 'shorts', 'skirt'] as const;
export const SHOE_STYLES = ['sneakers', 'formal', 'boots'] as const;
export const GLASSES = ['none', 'round', 'square'] as const;
export const HEADWEAR = ['none', 'cap', 'headphones', 'beanie'] as const;
export const BEARDS = ['none', 'stubble', 'full'] as const;

export type BodyType = (typeof BODY_TYPES)[number];
export type FaceType = (typeof FACE_TYPES)[number];
export type HairStyle = (typeof HAIR_STYLES)[number];
export type TopStyle = (typeof TOP_STYLES)[number];
export type BottomStyle = (typeof BOTTOM_STYLES)[number];
export type ShoeStyle = (typeof SHOE_STYLES)[number];
export type GlassesStyle = (typeof GLASSES)[number];
export type HeadwearStyle = (typeof HEADWEAR)[number];
export type BeardStyle = (typeof BEARDS)[number];

export interface AvatarConfig {
  body: BodyType;
  /** Height multiplier 0.9 – 1.1 */
  height: number;
  skin: string;
  face: FaceType;
  hair: HairStyle;
  hairColor: string;
  top: TopStyle;
  topColor: string;
  bottom: BottomStyle;
  bottomColor: string;
  shoes: ShoeStyle;
  shoesColor: string;
  glasses: GlassesStyle;
  headwear: HeadwearStyle;
  headwearColor: string;
  beard: BeardStyle;
  /** XBrain staff badge + lanyard */
  badge: boolean;
  earrings: boolean;
}

export const SKIN_TONES = ['#f6d7c3', '#efc3a4', '#e0ac85', '#c98e66', '#a86f4c', '#7c4f35', '#5a3825'];
export const HAIR_COLORS = ['#1b1714', '#3a2a20', '#5b3a24', '#8a5a36', '#b98a52', '#d9b779', '#9a9a9a', '#e8e4dc', '#7a2730', '#2f4b7c', '#f7941d'];
export const CLOTH_COLORS = [
  '#ffffff', '#f2efe8', '#d7d9dc', '#9aa1a9', '#4b5058', '#1f2227', '#111111',
  '#1f3a5f', '#2d5f8b', '#5aa9e6', '#2f6b4f', '#7bb662', '#b23a2e', '#e5622a',
  '#f7941d', '#f9b33f', '#7a4f9a', '#d97ab0', '#8b5e3c', '#c8b08a',
];

export const DEFAULT_AVATAR: AvatarConfig = {
  body: 'masc',
  height: 1,
  skin: SKIN_TONES[1],
  face: 'friendly',
  hair: 'short',
  hairColor: HAIR_COLORS[0],
  top: 'shirt',
  topColor: '#ffffff',
  bottom: 'pants',
  bottomColor: '#1f2227',
  shoes: 'formal',
  shoesColor: '#111111',
  glasses: 'none',
  headwear: 'none',
  headwearColor: '#1f2227',
  beard: 'none',
  badge: true,
  earrings: false,
};

export interface AvatarPreset {
  id: string;
  label: string;
  group: 'Nam' | 'Nữ' | 'Trung tính';
  config: AvatarConfig;
}

const p = (id: string, label: string, group: AvatarPreset['group'], c: Partial<AvatarConfig>): AvatarPreset => ({
  id, label, group, config: { ...DEFAULT_AVATAR, ...c },
});

export const AVATAR_PRESETS: AvatarPreset[] = [
  p('dev-m', 'XBrain Developer', 'Nam', { body: 'masc', hair: 'side', glasses: 'square', top: 'shirt', topColor: '#ffffff', bottomColor: '#1f2227' }),
  p('lead-m', 'Tech Lead', 'Nam', { body: 'masc', height: 1.04, skin: SKIN_TONES[2], hair: 'short', hairColor: HAIR_COLORS[1], top: 'blazer', topColor: '#1f2227', bottomColor: '#1f2227', beard: 'stubble' }),
  p('design-m', 'Creative', 'Nam', { body: 'masc', hair: 'curly', hairColor: HAIR_COLORS[2], top: 'hoodie', topColor: '#f7941d', bottom: 'pants', bottomColor: '#4b5058', shoes: 'sneakers', shoesColor: '#ffffff', headwear: 'headphones', headwearColor: '#1f2227', badge: false }),
  p('intern-m', 'Intern', 'Nam', { body: 'masc', height: 0.97, skin: SKIN_TONES[0], hair: 'buzz', top: 'polo', topColor: '#2d5f8b', bottomColor: '#c8b08a', shoes: 'sneakers', shoesColor: '#f2efe8' }),
  p('dev-f', 'XBrain Engineer', 'Nữ', { body: 'fem', height: 0.95, skin: SKIN_TONES[0], hair: 'long', hairColor: HAIR_COLORS[1], top: 'shirt', topColor: '#ffffff', bottom: 'pants', bottomColor: '#1f2227', glasses: 'round' }),
  p('pm-f', 'Product Manager', 'Nữ', { body: 'fem', height: 0.96, skin: SKIN_TONES[1], hair: 'bun', hairColor: HAIR_COLORS[0], top: 'blazer', topColor: '#7a4f9a', bottom: 'skirt', bottomColor: '#1f2227', shoes: 'formal', earrings: true }),
  p('hr-f', 'HR Partner', 'Nữ', { body: 'fem', height: 0.94, skin: SKIN_TONES[2], hair: 'bob', hairColor: HAIR_COLORS[2], top: 'tshirt', topColor: '#f9b33f', bottom: 'skirt', bottomColor: '#2d5f8b', earrings: true }),
  p('qa-f', 'QA Specialist', 'Nữ', { body: 'fem', height: 0.95, skin: SKIN_TONES[1], hair: 'ponytail', hairColor: HAIR_COLORS[3], top: 'hoodie', topColor: '#5aa9e6', bottomColor: '#4b5058', shoes: 'sneakers', shoesColor: '#ffffff' }),
  p('ops-n', 'DevOps', 'Trung tính', { body: 'neutral', skin: SKIN_TONES[3], hair: 'mohawk', hairColor: HAIR_COLORS[10], top: 'tshirt', topColor: '#1f2227', bottomColor: '#4b5058', shoes: 'boots', shoesColor: '#3a2a20', glasses: 'round', badge: false }),
  p('data-n', 'Data Scientist', 'Trung tính', { body: 'neutral', skin: SKIN_TONES[4], hair: 'short', hairColor: HAIR_COLORS[0], top: 'polo', topColor: '#2f6b4f', bottomColor: '#1f2227', headwear: 'beanie', headwearColor: '#b23a2e' }),
  p('guest-n', 'Visitor', 'Trung tính', { body: 'neutral', skin: SKIN_TONES[5], hair: 'curly', hairColor: HAIR_COLORS[0], top: 'shirt', topColor: '#d7d9dc', bottomColor: '#8b5e3c', headwear: 'cap', headwearColor: '#f7941d', badge: false }),
  p('exec-n', 'Executive', 'Trung tính', { body: 'neutral', height: 1.02, skin: SKIN_TONES[1], hair: 'side', hairColor: HAIR_COLORS[6], top: 'blazer', topColor: '#111111', bottomColor: '#111111', shoes: 'formal', beard: 'full' }),
];

const HEX = /^#[0-9a-fA-F]{6}$/;
const pick = <T extends string>(v: unknown, opts: readonly T[], def: T): T => (typeof v === 'string' && (opts as readonly string[]).includes(v) ? (v as T) : def);
const color = (v: unknown, def: string) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : def);

/** Validate and normalize an untrusted avatar config (server & client). */
export function sanitizeAvatar(input: unknown): AvatarConfig {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const d = DEFAULT_AVATAR;
  const h = typeof o.height === 'number' && Number.isFinite(o.height) ? Math.min(1.1, Math.max(0.9, o.height)) : d.height;
  return {
    body: pick(o.body, BODY_TYPES, d.body),
    height: Math.round(h * 100) / 100,
    skin: color(o.skin, d.skin),
    face: pick(o.face, FACE_TYPES, d.face),
    hair: pick(o.hair, HAIR_STYLES, d.hair),
    hairColor: color(o.hairColor, d.hairColor),
    top: pick(o.top, TOP_STYLES, d.top),
    topColor: color(o.topColor, d.topColor),
    bottom: pick(o.bottom, BOTTOM_STYLES, d.bottom),
    bottomColor: color(o.bottomColor, d.bottomColor),
    shoes: pick(o.shoes, SHOE_STYLES, d.shoes),
    shoesColor: color(o.shoesColor, d.shoesColor),
    glasses: pick(o.glasses, GLASSES, d.glasses),
    headwear: pick(o.headwear, HEADWEAR, d.headwear),
    headwearColor: color(o.headwearColor, d.headwearColor),
    beard: pick(o.beard, BEARDS, d.beard),
    badge: typeof o.badge === 'boolean' ? o.badge : d.badge,
    earrings: typeof o.earrings === 'boolean' ? o.earrings : d.earrings,
  };
}

/** Normalize a display name: trim, collapse whitespace, strip control chars, limit length. */
export function sanitizeName(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX_LENGTH);
}

export function randomAvatar(seed = Math.random()): AvatarConfig {
  let s = Math.floor(seed * 2 ** 31) || 1;
  const rnd = () => ((s = (s * 48271) % 2147483647) / 2147483647);
  const r = <T>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];
  const body = r(BODY_TYPES);
  return sanitizeAvatar({
    body,
    height: 0.94 + rnd() * 0.12,
    skin: r(SKIN_TONES),
    face: r(FACE_TYPES),
    hair: r(HAIR_STYLES),
    hairColor: r(HAIR_COLORS),
    top: r(TOP_STYLES),
    topColor: r(CLOTH_COLORS),
    bottom: body === 'fem' && rnd() > 0.5 ? 'skirt' : r(['pants', 'pants', 'shorts'] as const),
    bottomColor: r(CLOTH_COLORS),
    shoes: r(SHOE_STYLES),
    shoesColor: r(['#111111', '#ffffff', '#3a2a20', '#4b5058']),
    glasses: r(['none', 'none', 'round', 'square'] as const),
    headwear: r(['none', 'none', 'none', 'cap', 'headphones', 'beanie'] as const),
    headwearColor: r(CLOTH_COLORS),
    beard: body === 'masc' ? r(BEARDS) : 'none',
    badge: rnd() > 0.3,
    earrings: body !== 'masc' && rnd() > 0.5,
  });
}
