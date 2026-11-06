/** Keyboard input manager with remappable bindings (KeyboardEvent.code based). */
import { useSettings, type KeyAction } from '../../stores/settings';

type Handler = (e: KeyboardEvent) => void;

const ALT_KEYS: Partial<Record<KeyAction, string[]>> = {
  forward: ['ArrowUp'],
  back: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  run: ['ShiftRight'],
  chat: ['NumpadEnter'],
};

export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

class InputManager {
  private down = new Set<string>();
  private pressHandlers = new Map<KeyAction, Set<Handler>>();
  private releaseHandlers = new Map<KeyAction, Set<Handler>>();
  private started = false;
  /** When capturing a key binding in settings, gameplay input is suspended. */
  capturing = false;

  start() {
    if (this.started) return;
    this.started = true;
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.clear);
    document.addEventListener('visibilitychange', this.clear);
  }

  private clear = () => {
    for (const code of this.down) this.fire(this.releaseHandlers, code, new KeyboardEvent('keyup', { code }));
    this.down.clear();
  };

  private actionsFor(code: string): KeyAction[] {
    const keys = useSettings.getState().keys;
    const out: KeyAction[] = [];
    for (const [action, c] of Object.entries(keys) as Array<[KeyAction, string]>) {
      if (c === code || ALT_KEYS[action]?.includes(code)) out.push(action);
    }
    return out;
  }

  private fire(map: Map<KeyAction, Set<Handler>>, code: string, e: KeyboardEvent) {
    for (const a of this.actionsFor(code)) map.get(a)?.forEach((h) => h(e));
  }

  private onDown = (e: KeyboardEvent) => {
    if (this.capturing) return;
    if (isTypingTarget(e.target)) return;
    const actions = this.actionsFor(e.code);
    if (actions.some((a) => a === 'jump' || a === 'forward' || a === 'back' || a === 'left' || a === 'right')) e.preventDefault();
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    const repeat = this.down.has(e.code) || e.repeat;
    this.down.add(e.code);
    if (!repeat) this.fire(this.pressHandlers, e.code, e);
  };

  private onUp = (e: KeyboardEvent) => {
    if (!this.down.has(e.code)) return;
    this.down.delete(e.code);
    this.fire(this.releaseHandlers, e.code, e);
  };

  isDown(action: KeyAction): boolean {
    const keys = useSettings.getState().keys;
    if (this.down.has(keys[action])) return true;
    return !!ALT_KEYS[action]?.some((c) => this.down.has(c));
  }

  onPress(action: KeyAction, h: Handler) {
    if (!this.pressHandlers.has(action)) this.pressHandlers.set(action, new Set());
    this.pressHandlers.get(action)!.add(h);
    return () => {
      this.pressHandlers.get(action)!.delete(h);
    };
  }

  onRelease(action: KeyAction, h: Handler) {
    if (!this.releaseHandlers.has(action)) this.releaseHandlers.set(action, new Set());
    this.releaseHandlers.get(action)!.add(h);
    return () => {
      this.releaseHandlers.get(action)!.delete(h);
    };
  }

  releaseAll() {
    this.clear();
  }
}

export const input = new InputManager();
