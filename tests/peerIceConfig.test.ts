import { describe, it, expect, vi } from 'vitest';
import Peer from 'peerjs';
import { HostSession, ClientSession, fallbackIceServers, buildPeerConfig, meteredTurnCredentialsUrl } from '../src/net/peerSession';

vi.mock('peerjs', async () => {
  const created: unknown[] = [];
  class FakePeer {
    static created = created;
    options: Record<string, unknown>;
    constructor(_id: string, options: Record<string, unknown>) {
      this.options = options;
      created.push(this);
    }
    on(_event: string): this {
      return this;
    }
    connect(): { on: () => void; send: () => void } {
      return { on: () => undefined, send: () => undefined };
    }
    destroy(): void {}
  }
  return { default: FakePeer };
});

type ConstructedPeer = { options: { config?: RTCConfiguration } };

const peerClass = Peer as unknown as { created: ConstructedPeer[] };

function allUrls(servers: RTCIceServer[]): string[] {
  return servers.flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]));
}

describe('WebRTC ICE configuration', () => {
  it('fallback ICE uses live STUN servers and never the retired PeerJS relays', () => {
    const urls = allUrls(fallbackIceServers());
    expect(urls.some((u) => u === 'stun:stun.l.google.com:19302')).toBe(true);
    expect(urls.every((u) => u.startsWith('stun:'))).toBe(true);
    expect(urls.every((u) => !u.includes('turn.peerjs.com'))).toBe(true);
  });

  it('buildPeerConfig carries the servers', () => {
    const servers = fallbackIceServers();
    const cfg = buildPeerConfig(servers);
    expect(cfg.iceServers).toEqual(servers);
  });

  it('points at the Metered credentials API with an apiKey', () => {
    const url = new URL(meteredTurnCredentialsUrl());
    expect(url.hostname).toBe('swypse-hex.metered.live');
    expect(url.pathname).toBe('/api/v1/turn/credentials');
    expect(url.searchParams.get('apiKey')).toBeTruthy();
  });

  it('host Peer is built with an explicit ICE config instead of the PeerJS default', async () => {
    const before = peerClass.created.length;
    const host = new HostSession({ onOpen: () => {}, onData: () => {}, onClose: () => {} });
    host.open('ABC123');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const instance = peerClass.created[before];
    expect(instance).toBeDefined();
    const iceServers = instance!.options.config?.iceServers ?? [];
    expect(iceServers.length).toBeGreaterThan(0);
    expect(allUrls(iceServers).every((u) => !u.includes('turn.peerjs.com'))).toBe(true);
  });

  it('client Peer is built with an explicit ICE config instead of the PeerJS default', async () => {
    const before = peerClass.created.length;
    const client = new ClientSession({ onOpen: () => {}, onData: () => {}, onClose: () => {}, onError: () => {} });
    client.join('ABC123', 'Guest');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const instance = peerClass.created[before];
    expect(instance).toBeDefined();
    const iceServers = instance!.options.config?.iceServers ?? [];
    expect(iceServers.length).toBeGreaterThan(0);
    expect(allUrls(iceServers).every((u) => !u.includes('turn.peerjs.com'))).toBe(true);
  });
});
