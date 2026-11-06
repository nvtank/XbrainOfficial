/**
 * Proximity voice chat over a LiveKit SFU.
 *  - Selective subscription: only speakers within range (+hysteresis) are subscribed → scales to 50 users.
 *  - Every remote mic runs through WebAudio: gain (distance bands + room occlusion) → HRTF panner.
 *  - Closed rooms (meeting / kitchen / director) attenuate audio across walls; open doors leak a little.
 * Nothing is recorded or stored.
 */
import {
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client';
import {
  OPEN_DOOR_OCCLUSION_GAIN,
  VOICE_SUBSCRIBE_MARGIN,
  VOICE_UNSUBSCRIBE_MARGIN,
  WALL_OCCLUSION_GAIN,
  ZONE_BY_ID,
  zoneAt,
  type VoiceRanges,
  type ZoneId,
} from '@xbrain/shared';
import { useApp } from '../stores/app';
import { useGame } from '../stores/game';
import { useSettings } from '../stores/settings';
import { useVoiceStore } from '../stores/voice';
import { useWorld } from '../stores/world';
import { runtime } from '../game/runtime';
import { api } from './api';
import { audioCtx } from './sfx';

interface RemoteNode {
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode;
  panner: PannerNode;
  el: HTMLAudioElement;
}

const DOOR_OF_ZONE: Partial<Record<ZoneId, string>> = { meeting: 'door-meeting', kitchen: 'door-kitchen', director: 'door-director' };

/** Distance → gain using the configurable bands. */
export function distanceGain(d: number, r: VoiceRanges): number {
  if (d <= r.full) return 1;
  if (d <= r.mid) return 1 + (r.midGain - 1) * ((d - r.full) / (r.mid - r.full));
  if (d <= r.far) return r.midGain + (r.farGain - r.midGain) * ((d - r.mid) / (r.far - r.mid));
  return 0;
}

/** Wall/room occlusion multiplier between two zones. Returns [gain, muffled]. */
export function occlusion(lz: ZoneId | null, sz: ZoneId | null, objects: Record<string, number>): [number, boolean] {
  if (!lz || !sz || lz === sz) return [1, false];
  const le = ZONE_BY_ID[lz]?.enclosed;
  const se = ZONE_BY_ID[sz]?.enclosed;
  if (!le && !se) return [1, false];
  if (le && se) return [WALL_OCCLUSION_GAIN * 0.5, true]; // two different closed rooms
  const room = (le ? lz : sz) as ZoneId;
  const door = DOOR_OF_ZONE[room];
  const open = door ? !!objects[door] : false;
  return [open ? OPEN_DOOR_OCCLUSION_GAIN : WALL_OCCLUSION_GAIN, true];
}

class VoiceManager {
  room: Room | null = null;
  private sid: string | null = null;
  private nodes = new Map<string, RemoteNode>();
  private master: GainNode | null = null;
  private loop: number | null = null;
  private connecting = false;
  private testStream: MediaStream | null = null;
  private testRaf: number | null = null;
  private testMonitor: { src: MediaStreamAudioSourceNode; gain: GainNode } | null = null;

  async onJoined(sessionId: string) {
    this.sid = sessionId;
    const cfg = useApp.getState().serverConfig;
    if (!cfg?.voice.enabled) {
      useVoiceStore.getState().set({ status: 'unavailable', statusText: 'Voice server (LiveKit) is not configured on this server.' });
      return;
    }
    await this.connect();
  }

  async connect() {
    if (!this.sid || this.connecting || this.room) return;
    this.connecting = true;
    const vs = useVoiceStore.getState();
    vs.set({ status: 'connecting', statusText: 'Connecting to voice server…' });
    try {
      const { url, token } = await api.voiceToken(this.sid);
      const room = new Room({ adaptiveStream: false, dynacast: false, disconnectOnPageLeave: true });
      this.room = room;
      room
        .on(RoomEvent.TrackSubscribed, (track, _pub, participant) => this.attachTrack(track as RemoteTrack, participant))
        .on(RoomEvent.TrackUnsubscribed, (_track, _pub, participant) => this.detach(participant.identity))
        .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => this.detach(p.identity))
        .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
          const map: Record<string, boolean> = {};
          for (const s of speakers) map[s.identity] = true;
          useWorld.getState().set({ speaking: map });
        })
        .on(RoomEvent.Disconnected, () => {
          this.cleanup();
          useVoiceStore.getState().set({ status: 'error', statusText: 'Voice disconnected', micOn: false });
        })
        .on(RoomEvent.MediaDevicesError, (e: Error) => {
          useVoiceStore.getState().set({ permission: 'denied', micOn: false });
          useGame.getState().toast('error', `Microphone error: ${e.message}`);
        });
      await room.connect(url, token, { autoSubscribe: false });
      const ctx = audioCtx();
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.applyVolume();
      vs.set({ status: 'connected', statusText: 'Proximity voice connected' });
      this.loop = window.setInterval(() => this.update(), 100);
      void this.refreshDevices();
    } catch (e) {
      this.room = null;
      vs.set({ status: 'error', statusText: `Voice unavailable: ${(e as Error).message}` });
    } finally {
      this.connecting = false;
    }
  }

  private attachTrack(track: RemoteTrack, participant: RemoteParticipant) {
    if (track.kind !== Track.Kind.Audio) return;
    this.detach(participant.identity);
    const ctx = audioCtx();
    const stream = new MediaStream([track.mediaStreamTrack]);
    // Chrome only feeds WebRTC streams into WebAudio when they are also attached to a (muted) element.
    const el = new Audio();
    el.muted = true;
    el.srcObject = stream;
    void el.play().catch(() => undefined);
    const source = ctx.createMediaStreamSource(stream);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 20000;
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'linear';
    panner.refDistance = 1;
    panner.maxDistance = 10000;
    panner.rolloffFactor = 0; // distance attenuation is handled by our own gain curve
    source.connect(gain).connect(filter).connect(panner).connect(this.master ?? ctx.destination);
    this.nodes.set(participant.identity, { source, gain, filter, panner, el });
  }

  private detach(identity: string) {
    const n = this.nodes.get(identity);
    if (!n) return;
    n.source.disconnect();
    n.gain.disconnect();
    n.filter.disconnect();
    n.panner.disconnect();
    n.el.srcObject = null;
    this.nodes.delete(identity);
  }

  /** 10 Hz: subscription management (interest) + gains + panning. */
  private update() {
    const room = this.room;
    if (!room) return;
    const ctx = audioCtx();
    const s = useSettings.getState();
    const vs = useVoiceStore.getState();
    const objects = useWorld.getState().objects;
    const r = s.voiceRanges;
    const me = runtime.local.pos;
    const lz = zoneAt(me.x, me.z);
    const t = ctx.currentTime;

    const L = ctx.listener;
    const f = runtime.listenerForward;
    const lp = runtime.listenerPos;
    if (L.positionX) {
      L.positionX.setTargetAtTime(lp.x, t, 0.05);
      L.positionY.setTargetAtTime(lp.y, t, 0.05);
      L.positionZ.setTargetAtTime(lp.z, t, 0.05);
      L.forwardX.setTargetAtTime(f.x, t, 0.05);
      L.forwardY.setTargetAtTime(f.y, t, 0.05);
      L.forwardZ.setTargetAtTime(f.z, t, 0.05);
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    } else {
      L.setPosition(lp.x, lp.y, lp.z);
      L.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }

    const audible: Record<string, number> = {};
    for (const p of room.remoteParticipants.values()) {
      const pub = p.getTrackPublication(Track.Source.Microphone) as RemoteTrackPublication | undefined;
      const pos = runtime.remotePos.get(p.identity);
      const d = pos ? Math.hypot(pos.x - me.x, pos.z - me.z) : Infinity;
      const sz = pos ? zoneAt(pos.x, pos.z) : null;
      const sameMeeting = lz === 'meeting' && sz === 'meeting';
      if (pub) {
        const want = sameMeeting || d < r.far + VOICE_SUBSCRIBE_MARGIN || (pub.isSubscribed && d < r.far + VOICE_UNSUBSCRIBE_MARGIN);
        if (want !== pub.isSubscribed) pub.setSubscribed(want);
      }
      const n = this.nodes.get(p.identity);
      if (!n || !pos) continue;
      let g = distanceGain(d, r);
      // Meeting room is its own audio zone: everyone inside hears each other clearly.
      if (sameMeeting) g = Math.max(g, 0.85);
      const [occ, muffled] = occlusion(lz, sz, objects);
      g *= occ;
      const userVol = vs.userVolume[p.identity] ?? 1;
      if (vs.localMuted[p.identity]) g = 0;
      g *= userVol;
      n.gain.gain.setTargetAtTime(g, t, 0.08);
      n.filter.frequency.setTargetAtTime(muffled ? 900 : 20000, t, 0.1);
      if (n.panner.positionX) {
        n.panner.positionX.setTargetAtTime(pos.x, t, 0.05);
        n.panner.positionY.setTargetAtTime(pos.y + 1.55, t, 0.05);
        n.panner.positionZ.setTargetAtTime(pos.z, t, 0.05);
      } else n.panner.setPosition(pos.x, pos.y + 1.55, pos.z);
      if (g > 0.01) audible[p.identity] = Math.round(g * 100) / 100;
    }
    const prev = vs.audible;
    const changed = Object.keys(prev).length !== Object.keys(audible).length || Object.entries(audible).some(([k, v]) => Math.abs((prev[k] ?? -1) - v) > 0.05);
    if (changed) vs.set({ audible });
  }

  applyVolume() {
    const s = useSettings.getState();
    if (this.master) this.master.gain.value = s.masterVolume * s.voiceVolume;
  }

  async setMic(on: boolean) {
    const vs = useVoiceStore.getState();
    const room = this.room;
    if (!room) {
      useGame.getState().toast('warn', vs.statusText || 'Voice is not connected.');
      return;
    }
    const me = useWorld.getState().selfSid ? useWorld.getState().players[useWorld.getState().selfSid!] : undefined;
    if (on && me?.muted) {
      useGame.getState().toast('warn', 'You are muted by an administrator.');
      return;
    }
    const s = useSettings.getState();
    try {
      await room.localParticipant.setMicrophoneEnabled(on, {
        deviceId: s.micDeviceId || undefined,
        echoCancellation: s.echoCancellation,
        noiseSuppression: s.noiseSuppression,
        autoGainControl: true,
      });
      vs.set({ micOn: on, permission: 'granted' });
      const { net } = await import('./network');
      net.voiceState(on);
      if (on) void this.refreshDevices();
    } catch (e) {
      const denied = (e as Error).name === 'NotAllowedError';
      vs.set({ micOn: false, permission: denied ? 'denied' : vs.permission });
      useGame.getState().toast('error', denied ? 'Microphone permission was denied. Allow it in your browser to talk.' : `Could not start microphone: ${(e as Error).message}`);
    }
  }

  /** Push-to-talk: open the mic only while the key is held. */
  async ptt(down: boolean) {
    const vs = useVoiceStore.getState();
    if (vs.pttHeld === down) return;
    vs.set({ pttHeld: down });
    await this.setMic(down);
  }

  async switchDevice(deviceId: string) {
    useSettings.getState().set({ micDeviceId: deviceId });
    if (this.room) await this.room.switchActiveDevice('audioinput', deviceId).catch(() => undefined);
  }

  async refreshDevices() {
    try {
      const devices = await Room.getLocalDevices('audioinput', false);
      useVoiceStore.getState().set({ devices });
    } catch {
      /* ignore */
    }
  }

  /** Microphone test (works without the voice server): level meter + optional loopback. */
  async startMicTest(loopback: boolean) {
    this.stopMicTest();
    const s = useSettings.getState();
    try {
      this.testStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: s.micDeviceId ? { exact: s.micDeviceId } : undefined, echoCancellation: s.echoCancellation, noiseSuppression: s.noiseSuppression },
      });
      useVoiceStore.getState().set({ permission: 'granted' });
      void this.refreshDevices();
      const ctx = audioCtx();
      const src = ctx.createMediaStreamSource(this.testStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      if (loopback) {
        const gain = ctx.createGain();
        gain.gain.value = 0.8;
        src.connect(gain).connect(ctx.destination);
        this.testMonitor = { src, gain };
      }
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
        useVoiceStore.getState().set({ inputLevel: Math.min(1, peak * 1.6) });
        this.testRaf = requestAnimationFrame(tick);
      };
      tick();
      return true;
    } catch (e) {
      useVoiceStore.getState().set({ permission: 'denied' });
      useGame.getState().toast('error', `Microphone unavailable: ${(e as Error).message}`);
      return false;
    }
  }

  stopMicTest() {
    if (this.testRaf) cancelAnimationFrame(this.testRaf);
    this.testRaf = null;
    this.testMonitor?.gain.disconnect();
    this.testMonitor = null;
    this.testStream?.getTracks().forEach((t) => t.stop());
    this.testStream = null;
    useVoiceStore.getState().set({ inputLevel: 0 });
  }

  private cleanup() {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
    for (const id of [...this.nodes.keys()]) this.detach(id);
    this.master?.disconnect();
    this.master = null;
    this.room = null;
    useWorld.getState().set({ speaking: {} });
  }

  disconnect() {
    const r = this.room;
    this.cleanup();
    void r?.disconnect();
    useVoiceStore.getState().set({ status: 'off', micOn: false, pttHeld: false });
  }
}

export const voice = new VoiceManager();
