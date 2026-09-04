import { describe, it, expect } from 'vitest';
import { generateRoomCode, generateClientId, hostPeerId, ClientMessage, HostMessage } from '../src/net/peerSession';

// Mirrors PeerJS's internal validateId pattern.
const PEERJS_ID = /^[A-Za-z0-9]+(?:[ _-][A-Za-z0-9]+)*$/;

describe('peerSession protocol', () => {
  it('generateRoomCode returns 6 chars from the safe alphabet', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      seen.add(code);
    }
    expect(seen.size).toBeGreaterThan(900);
  });

  it('generateClientId produces unique IDs valid for PeerJS', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const id = generateClientId();
      expect(id).toMatch(PEERJS_ID);
      expect(id.startsWith('guest-')).toBe(true);
      seen.add(id);
    }
    expect(seen.size).toBeGreaterThan(990);
  });

  it('hostPeerId prefixes the code', () => {
    expect(hostPeerId('ABC123')).toBe('hex-ABC123');
  });

  it('ClientMessage and HostMessage survive JSON round-trip', () => {
    const cmd: ClientMessage = { type: 'command', cmd: { type: 'endTurn' } };
    expect(JSON.parse(JSON.stringify(cmd))).toEqual(cmd);
    const msg: HostMessage = { type: 'error', message: 'x' };
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
    const onlineMsg: HostMessage = { type: 'playersOnline', online: [true, false, true] };
    expect(JSON.parse(JSON.stringify(onlineMsg))).toEqual(onlineMsg);
  });
});
