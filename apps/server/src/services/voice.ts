/** LiveKit SFU integration: access tokens and participant permission updates (moderation). */
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { config, voiceEnabled } from '../config';

let svc: RoomServiceClient | null = null;
const roomService = () => {
  if (!voiceEnabled()) return null;
  svc ??= new RoomServiceClient(config.livekit.host, config.livekit.apiKey, config.livekit.apiSecret);
  return svc;
};

export const voiceRoomName = (officeId: string) => `office-${officeId}`;

export async function createVoiceToken(opts: { officeId: string; identity: string; name: string; userId: string; canPublish: boolean }) {
  const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
    identity: opts.identity,
    name: opts.name,
    ttl: '6h',
    metadata: JSON.stringify({ userId: opts.userId }),
  });
  at.addGrant({
    room: voiceRoomName(opts.officeId),
    roomJoin: true,
    canPublish: opts.canPublish,
    canPublishData: false,
    canSubscribe: true,
  });
  return at.toJwt();
}

/** Revoke / restore a participant's right to publish audio (admin mute). */
export async function setVoicePublish(officeId: string, identity: string, canPublish: boolean) {
  const rs = roomService();
  if (!rs) return;
  try {
    await rs.updateParticipant(voiceRoomName(officeId), identity, undefined, {
      canPublish,
      canSubscribe: true,
      canPublishData: false,
    } as never);
  } catch (e) {
    // Participant may not be connected to voice — harmless.
    if (config.env !== 'production') console.debug('[voice] updateParticipant skipped:', (e as Error).message);
  }
}

export async function removeVoiceParticipant(officeId: string, identity: string) {
  const rs = roomService();
  if (!rs) return;
  await rs.removeParticipant(voiceRoomName(officeId), identity).catch(() => undefined);
}
