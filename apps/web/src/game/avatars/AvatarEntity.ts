/** Imperative avatar object: rig + animator + nameplate + speech bubble. Driven per-frame without React re-renders. */
import * as THREE from 'three';
import type { AvatarConfig } from '@xbrain/shared';
import { avatarKey, createAvatar, type AvatarRig } from './avatarFactory';
import { AvatarAnimator, type AnimInput } from './animator';
import { Nameplate, SpeechBubble, type NameplateState } from './nameplate';

export class AvatarEntity {
  readonly group = new THREE.Group();
  rig!: AvatarRig;
  animator!: AvatarAnimator;
  readonly plate = new Nameplate();
  readonly bubble = new SpeechBubble();
  private key = '';
  private castShadow: boolean;
  private plateY = 1.95;
  /** Animation LOD accumulator. */
  private skipAcc = 0;

  constructor(cfg: AvatarConfig, opts: { castShadow?: boolean } = {}) {
    this.castShadow = !!opts.castShadow;
    this.group.add(this.plate.sprite, this.bubble.sprite);
    this.setConfig(cfg);
  }

  setConfig(cfg: AvatarConfig) {
    const key = avatarKey(cfg);
    if (key === this.key) return;
    this.key = key;
    if (this.rig) {
      this.group.remove(this.rig.root);
      this.animator.dispose();
      this.rig.dispose();
    }
    this.rig = createAvatar(cfg, { castShadow: this.castShadow });
    this.animator = new AvatarAnimator(this.rig.mesh);
    this.group.add(this.rig.root);
  }

  setShadow(cast: boolean) {
    this.castShadow = cast;
    this.rig.mesh.castShadow = cast;
  }

  /**
   * @param lodLevel 0 = full rate, 1 = half rate, 2 = quarter rate animation updates.
   */
  update(dt: number, anim: AnimInput, lodLevel = 0) {
    const step = lodLevel === 0 ? 1 : lodLevel === 1 ? 2 : 4;
    this.skipAcc += dt;
    this.animFrame = (this.animFrame + 1) % step;
    if (this.animFrame === 0) {
      this.animator.update(this.skipAcc, anim);
      this.skipAcc = 0;
    }
    const seated = anim.loco === 'sit' || anim.loco === 'type';
    const target = (seated ? 1.5 : 1.93) * (this.rig.height / 1.72);
    this.plateY += (target - this.plateY) * Math.min(1, dt * 6);
    this.plate.sprite.position.y = this.plateY;
    this.bubble.sprite.position.y = this.plateY + 0.56;
  }
  private animFrame = 0;

  setPlate(s: NameplateState | null) {
    if (!s) {
      this.plate.sprite.visible = false;
      return;
    }
    this.plate.sprite.visible = true;
    this.plate.update(s);
  }

  setBubble(text: string | null) {
    this.bubble.sprite.visible = !!text;
    if (text) this.bubble.setText(text);
  }

  setMeshVisible(v: boolean) {
    this.rig.root.visible = v;
  }

  dispose() {
    this.animator.dispose();
    this.rig.dispose();
    this.plate.dispose();
    this.bubble.dispose();
  }
}

/** Map a network animation code + speed to a locomotion state. */
export { AnimCode } from '@xbrain/shared';
