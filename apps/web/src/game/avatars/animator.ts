/**
 * Three-layer animation state machine with cross-fading:
 *   lower body (locomotion / sit), upper body (typing, talking, body emotes) and
 *   face (expressions, blinking, talking mouth).
 */
import * as THREE from 'three';
import { EMOTE_BODY, EMOTE_FACE, RUN_SPEED, WALK_SPEED, type EmoteName, type FaceExpression } from '@xbrain/shared';
import { getClips, type LowerClip, type UpperClip } from './animations';

export type Loco = 'idle' | 'walk' | 'run' | 'jump' | 'sit' | 'type' | 'turn';

export interface AnimInput {
  loco: Loco;
  speed: number;
  emote: EmoteName | null;
  talking: boolean;
}

type Layer = 'lower' | 'upper' | 'face';

export class AvatarAnimator {
  readonly mixer: THREE.AnimationMixer;
  private actions: Record<Layer, Map<string, THREE.AnimationAction>> = { lower: new Map(), upper: new Map(), face: new Map() };
  private current: Record<Layer, string | null> = { lower: null, upper: null, face: null };

  constructor(root: THREE.Object3D) {
    this.mixer = new THREE.AnimationMixer(root);
    const clips = getClips();
    const register = (layer: Layer, entries: Array<[string, THREE.AnimationClip]>, loops: Record<string, boolean>) => {
      for (const [name, clip] of entries) {
        const a = this.mixer.clipAction(clip);
        if (loops[name] === false) {
          a.setLoop(THREE.LoopOnce, 1);
          a.clampWhenFinished = true;
        }
        this.actions[layer].set(name, a);
      }
    };
    register('lower', Object.entries(clips.lower), clips.loops);
    register('upper', Object.entries(clips.upper), clips.loops);
    register('face', Object.entries(clips.face), {});
    this.play('lower', 'idle', 0);
    this.play('upper', 'idle', 0);
    this.play('face', 'neutral', 0);
  }

  private play(layer: Layer, name: string, fade: number, timeScale = 1) {
    const map = this.actions[layer];
    const cur = this.current[layer];
    const next = map.get(name);
    if (!next) return;
    next.timeScale = timeScale;
    if (cur === name) return;
    const prev = cur ? map.get(cur) : undefined;
    next.reset();
    next.setEffectiveWeight(1);
    next.play();
    if (prev && fade > 0) next.crossFadeFrom(prev, fade, false);
    else if (prev) prev.stop();
    if (layer === 'upper' && (name === 'walk' || name === 'run') && this.current.lower === name) next.time = map.get(name)!.time;
    this.current[layer] = name;
  }

  update(dt: number, s: AnimInput) {
    const seated = s.loco === 'sit' || s.loco === 'type';
    const fade = seated || this.current.lower === 'sit' ? 0.5 : 0.2;
    const body = s.emote ? EMOTE_BODY[s.emote] : null;
    const moving = s.loco === 'walk' || s.loco === 'run' || s.loco === 'jump';

    // Lower body
    let lower: LowerClip;
    let ts = 1;
    if (seated) lower = 'sit';
    else if (body === 'dance' && s.loco === 'idle') lower = 'dance';
    else if (s.loco === 'turn') {
      lower = 'walk';
      ts = 0.65;
    } else if (s.loco === 'walk') {
      lower = 'walk';
      ts = THREE.MathUtils.clamp(s.speed / WALK_SPEED, 0.55, 1.5);
    } else if (s.loco === 'run') {
      lower = 'run';
      ts = THREE.MathUtils.clamp(s.speed / RUN_SPEED, 0.7, 1.3);
    } else lower = s.loco === 'jump' ? 'jump' : 'idle';
    this.play('lower', lower, fade, ts);

    // Upper body — body emotes pause while moving (the face keeps the expression)
    let upper: UpperClip;
    if (body && !moving && !(seated && body === 'dance')) upper = body;
    else if (s.loco === 'type') upper = s.talking ? 'talk' : 'type';
    else if (s.loco === 'sit') upper = s.talking ? 'talk' : 'sit';
    else if (moving) upper = s.loco as UpperClip;
    else if (s.loco === 'turn') upper = 'walk';
    else upper = s.talking ? 'talk' : 'idle';
    this.play('upper', upper, fade, upper === lower ? ts : 1);

    // Face
    const face: FaceExpression = s.emote ? EMOTE_FACE[s.emote] : s.talking ? 'talk' : 'neutral';
    this.play('face', face, 0.18);
    this.mixer.update(dt);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
  }
}
