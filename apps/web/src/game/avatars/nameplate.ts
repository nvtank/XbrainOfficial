/** Canvas-texture sprites for name tags (name / WORKING / timer / mic) and chat speech bubbles. */
import * as THREE from 'three';

const FONT = '"Be Vietnam Pro", "Segoe UI", system-ui, sans-serif';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export interface NameplateState {
  name: string;
  self: boolean;
  working: boolean;
  timer: string;
  micOn: boolean;
  speaking: boolean;
  muted: boolean;
  offline: boolean;
  status: string;
}

export class Nameplate {
  readonly sprite: THREE.Sprite;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private key = '';

  constructor() {
    this.canvas.width = 512;
    this.canvas.height = 256;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    const mat = new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.scale.set(1.3, 0.65, 1);
    this.sprite.center.set(0.5, 0);
    this.sprite.renderOrder = 10;
  }

  update(s: NameplateState) {
    const key = JSON.stringify(s);
    if (key === this.key) return;
    this.key = key;
    const c = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    c.clearRect(0, 0, W, H);
    c.font = `700 40px ${FONT}`;
    const nameW = Math.min(440, c.measureText(s.name).width);
    const lines = s.working ? 3 : s.status ? 2 : 1;
    const boxW = Math.max(nameW + 90, s.working ? 250 : 0, s.status ? Math.min(460, c.measureText(s.status).width * 0.62 + 60) : 0);
    const boxH = 66 + (lines - 1) * 50;
    const x = (W - boxW) / 2;
    const y = H - boxH - 4;
    roundRect(c, x, y, boxW, boxH, 22);
    c.fillStyle = s.offline ? 'rgba(60,60,60,0.65)' : s.self ? 'rgba(229,98,42,0.82)' : 'rgba(17,19,24,0.74)';
    c.fill();
    if (s.speaking) {
      c.lineWidth = 6;
      c.strokeStyle = '#4ade80';
      c.stroke();
    }
    // Mic indicator dot
    const dotX = x + 30;
    const dotY = y + 34;
    c.beginPath();
    c.arc(dotX, dotY, 10, 0, Math.PI * 2);
    c.fillStyle = s.muted ? '#ef4444' : s.speaking ? '#4ade80' : s.micOn ? '#a3e635' : 'rgba(255,255,255,0.28)';
    c.fill();
    if (s.muted || (!s.micOn && !s.speaking)) {
      c.strokeStyle = s.muted ? '#fff' : 'rgba(255,255,255,0.5)';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(dotX - 7, dotY + 7);
      c.lineTo(dotX + 7, dotY - 7);
      c.stroke();
    }
    c.fillStyle = '#ffffff';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.font = `700 40px ${FONT}`;
    let name = s.name;
    while (c.measureText(name).width > 440 - 60 && name.length > 3) name = name.slice(0, -2) + '…';
    c.fillText(name, x + 52, y + 35);
    if (s.working) {
      c.font = `800 26px ${FONT}`;
      c.fillStyle = s.offline ? '#d4d4d4' : '#fbbf24';
      c.textAlign = 'center';
      c.fillText(s.offline ? '⏸ PAUSED · RECONNECTING' : '● WORKING', W / 2, y + 84);
      c.font = `700 40px "JetBrains Mono", ui-monospace, monospace`;
      c.fillStyle = '#ffffff';
      c.fillText(s.timer, W / 2, y + 132);
    } else if (s.status) {
      c.font = `600 24px ${FONT}`;
      c.fillStyle = 'rgba(255,255,255,0.8)';
      c.textAlign = 'center';
      c.fillText(s.status, W / 2, y + 86);
    }
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
    (this.sprite.material as THREE.SpriteMaterial).dispose();
  }
}

export class SpeechBubble {
  readonly sprite: THREE.Sprite;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private text = '';

  constructor() {
    this.canvas.width = 512;
    this.canvas.height = 220;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false }));
    this.sprite.scale.set(1.5, 0.645, 1);
    this.sprite.center.set(0.5, 0);
    this.sprite.renderOrder = 11;
    this.sprite.visible = false;
  }

  setText(text: string) {
    if (text === this.text) return;
    this.text = text;
    const c = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    c.clearRect(0, 0, W, H);
    if (!text) return;
    c.font = `600 30px ${FONT}`;
    const words = text.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (c.measureText(t).width > 440 && cur) {
        lines.push(cur);
        cur = w;
      } else cur = t;
      if (lines.length === 3) break;
    }
    if (lines.length < 3 && cur) lines.push(cur);
    if (lines.length === 3 && words.join(' ').length > lines.join(' ').length) lines[2] = lines[2].slice(0, -1) + '…';
    const w = Math.min(480, Math.max(...lines.map((l) => c.measureText(l).width)) + 40);
    const h = lines.length * 38 + 26;
    const x = (W - w) / 2;
    const y = H - h - 22;
    roundRect(c, x, y, w, h, 18);
    c.fillStyle = 'rgba(255,255,255,0.95)';
    c.fill();
    c.beginPath();
    c.moveTo(W / 2 - 14, y + h);
    c.lineTo(W / 2, y + h + 18);
    c.lineTo(W / 2 + 14, y + h);
    c.fill();
    c.fillStyle = '#16181d';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    lines.forEach((l, i) => c.fillText(l, W / 2, y + 13 + 19 + i * 38));
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
    (this.sprite.material as THREE.SpriteMaterial).dispose();
  }
}
