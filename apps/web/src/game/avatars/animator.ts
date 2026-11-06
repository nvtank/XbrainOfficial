/** Two-layer animation state machine (lower body locomotion + upper body actions) with cross-fading. */
import * as THREE from 'three';
import { RUN_SPEED, WALK_SPEED, type EmoteName } from '@xbrain/shared';
import { getClips, type LowerClip, type UpperClip } from './animations';

export type Loco = 'idle' | 'walk' | 'run' | 'jump' | 'sit' | 'type' | 'turn';

export interface AnimInput {
  loco: Loco;
  speed: number;
  emote: EmoteName | null;
  talking: boolean;
}

export class AvatarAnimator {
  readonly mixer: THREE.AnimationMixer;
  private lower = new Map<LowerClip, THREE.AnimationAction>();
  private upper = new Map<UpperClip, THREE.AnimationAction>();
  private curLower: LowerClip | null = null;
  private curUpper: UpperClip | null = null;

  constructor(root: THREE.Object3D) {
    this.mixer = new THREE.AnimationMixer(root);
    const clips = getClips();
    for (const [name, clip] of Object.entries(clips.lower) as Array<[LowerClip, THREE.AnimationClip]>) {
      const a = this.mixer.clipAction(clip);
      if (!clips.loops[name]) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.lower.set(name, a);
    }
    for (const [name, clip] of Object.entries(clips.upper) as Array<[UpperClip, THREE.AnimationClip]>) {
      const a = this.mixer.clipAction(clip);
      if (!clips.loops[name]) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.upper.set(name, a);
    }
    this.play('lower', 'idle', 0);
    this.play('upper', 'idle', 0);
  }

  private play(layer: 'lower' | 'upper', name: LowerClip | UpperClip, fade: number, timeScale = 1) {
    const map = (layer === 'lower' ? this.lower : this.upper) as Map<string, THREE.AnimationAction>;
    const cur = layer === 'lower' ? this.curLower : this.curUpper;
    const next = map.get(name);
    if (!next) return;
    next.timeScale = timeScale;
    if (cur === name) return;
    const prev = cur ? map.get(cur) : undefined;
    next.reset();
    next.setEffectiveWeight(1);
    next.play();
    if (prev && fade > 0) {
      next.crossFadeFrom(prev, fade, false);
    } else if (prev) prev.stop();
    // Keep upper & lower locomotion cycles in phase.
    if (layer === 'upper' && (name === 'walk' || name === 'run') && this.curLower === name) {
      next.time = this.lower.get(name as LowerClip)!.time;
    }
    if (layer === 'lower') this.curLower = name as LowerClip;
    else this.curUpper = name as UpperClip;
  }

  update(dt: number, s: AnimInput) {
    const seated = s.loco === 'sit' || s.loco === 'type';
    const fade = seated || this.curLower === 'sit' ? 0.55 : 0.22;
    // Lower body
    let lower: LowerClip;
    let ts = 1;
    if (seated) lower = 'sit';
    else if (s.emote === 'dance' && s.loco === 'idle') lower = 'dance';
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

    // Upper body
    let upper: UpperClip;
    const moving = s.loco === 'walk' || s.loco === 'run' || s.loco === 'jump';
    if (s.emote && !(moving && s.emote === 'dance')) upper = s.emote;
    else if (s.loco === 'type') upper = s.talking ? 'talk' : 'type';
    else if (s.loco === 'sit') upper = s.talking ? 'talk' : 'sit';
    else if (moving) upper = s.loco as UpperClip;
    else if (s.loco === 'turn') upper = 'walk';
    else upper = s.talking ? 'talk' : 'idle';
    this.play('upper', upper, fade, upper === lower ? ts : 1);
    this.mixer.update(dt);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
  }
}
