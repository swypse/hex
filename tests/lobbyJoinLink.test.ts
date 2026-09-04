import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Sprite, Text } from 'pixi.js';
import { LobbyScreen } from '../src/ui/screens/LobbyScreen';
import { useGameStore } from '../src/store/gameStore';
import { buildJoinLink, consumePendingJoin, readJoinCode, setPendingJoin } from '../src/net/joinLink';
import { type UIHost } from '../src/ui/host';
import { TRIBES, Tribe } from '../src/game/tribes';

describe('join link helpers', () => {
  afterEach(() => {
    setPendingJoin(null);
    expect(consumePendingJoin()).toBeNull();
  });

  it('reads an uppercased join code from the URL query', () => {
    expect(readJoinCode('https://example.com/hex/?join=ABC234')).toBe('ABC234');
    expect(readJoinCode('https://example.com/hex/?join=abc234')).toBe('ABC234');
    expect(readJoinCode('https://example.com/hex/?join=abc234&x=1')).toBe('ABC234');
  });

  it('ignores missing or invalid join params', () => {
    expect(readJoinCode('https://example.com/hex/')).toBeNull();
    expect(readJoinCode('https://example.com/hex/?join=AB')).toBeNull();
    expect(readJoinCode('https://example.com/hex/?join=ABC23O')).toBeNull();
    expect(readJoinCode('https://example.com/hex/?join=ABC23 4')).toBeNull();
    expect(readJoinCode('not a url')).toBeNull();
  });

  it('builds a link carrying the join code and clears other params', () => {
    const link = buildJoinLink('abc234', 'https://example.com/hex/?other=1#frag');
    const u = new URL(link);
    expect(`${u.origin}${u.pathname}`).toBe('https://example.com/hex/');
    expect(u.searchParams.get('join')).toBe('ABC234');
    expect(u.searchParams.has('other')).toBe(false);
    expect(u.hash).toBe('');
  });

  it('keeps a pending join code for the lobby screen to consume', () => {
    setPendingJoin('XYZ789');
    expect(consumePendingJoin()).toBe('XYZ789');
    expect(consumePendingJoin()).toBeNull();
  });
});

function fakeCanvasContext() {
  return {
    measureText: (s: string) => ({
      width: s.length * 8,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: s.length * 8,
      actualBoundingBoxAscent: 12,
      actualBoundingBoxDescent: 3,
    }),
  };
}

function makeHost(): UIHost {
  return {
    app: { screen: { width: 1280, height: 800 }, stage: new Container() },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

function installDom(): void {
  Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
  Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
  (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
  (globalThis as { document?: unknown }).document = {
    createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    activeElement: null,
  };
  (globalThis as { HTMLInputElement?: unknown }).HTMLInputElement = class {};
}

function allTexts(c: Container): string[] {
  const out: string[] = [];
  const walk = (n: Container): void => {
    for (const ch of n.children) {
      if (ch instanceof Text) out.push(String((ch as Text).text));
      if (ch instanceof Container) walk(ch as Container);
    }
  };
  walk(c);
  return out;
}

describe('LobbyScreen join link prefill', () => {
  let screen: LobbyScreen;
  let host: ReturnType<typeof makeHost>;

  beforeEach(() => {
    installDom();
    setPendingJoin(null);
    useGameStore.setState({ screen: 'lobby', lobby: null, connection: 'idle' });
    host = makeHost();
    screen = new LobbyScreen();
  });

  afterEach(() => {
    screen.destroy();
    setPendingJoin(null);
    vi.restoreAllMocks();
  });

  it('opens the join view with the code already filled in', () => {
    setPendingJoin('ABC234');
    screen.mount(host);
    const s = screen as unknown as { view: string; code: string; root: Container };
    expect(s.view).toBe('join');
    expect(s.code).toBe('ABC234');
    expect(allTexts(s.root)).toContain('ABC234');
  });

  it('still opens the menu when no join code is pending', () => {
    screen.mount(host);
    const s = screen as unknown as { view: string; code: string };
    expect(s.view).toBe('menu');
    expect(s.code).toBe('');
  });
});

describe('LobbyScreen host copy join link button', () => {
  let screen: LobbyScreen;
  let host: ReturnType<typeof makeHost>;

  beforeEach(() => {
    installDom();
    setPendingJoin(null);
    host = makeHost();
    Object.defineProperty(globalThis.window, 'location', {
      configurable: true,
      value: { href: 'https://example.com/hex/' },
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    useGameStore.setState({
      screen: 'lobby',
      myPeerId: 'host',
      netMode: 'host',
      lobby: {
        role: 'host',
        code: 'ABC234',
        mode: 'capture',
        totalPlayers: 2,
        aiCount: 0,
        players: [{ peerId: 'host', name: 'Host', tribeId: Tribe.Cats, isHost: true, ready: true }],
      },
    });
    screen = new LobbyScreen();
    screen.mount(host);
  });

  afterEach(() => {
    screen.destroy();
    delete (globalThis.window as { location?: unknown }).location;
    delete (navigator as { clipboard?: unknown }).clipboard;
    useGameStore.setState({ lobby: null, myPeerId: '' });
    vi.restoreAllMocks();
  });

  it('shows a Copy join link button in the host room', () => {
    const root = (screen as unknown as { root: Container }).root!;
    const btn = root.children.find((c) =>
      allTexts(c as Container).includes('Copy join link'),
    ) as Container | undefined;
    expect(btn).toBeDefined();
  });

  it('copies a join link carrying the room code', () => {
    const root = (screen as unknown as { root: Container }).root!;
    const btn = root.children.find((c) =>
      allTexts(c as Container).includes('Copy join link'),
    ) as { trigger: () => void } | undefined;
    expect(btn).toBeDefined();
    btn!.trigger();
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    const link = vi.mocked(navigator.clipboard.writeText).mock.calls[0]![0] as string;
    expect(link).toContain('join=ABC234');
    expect(allTexts(root)).toContain('Copied!');
  });

  it('renders the tribe row like the single-player picker', () => {
    const root = (screen as unknown as { root: Container }).root!;
    const options = root.children.filter((c) =>
      (c as Container).children.some((ch) => ch instanceof Sprite && (ch as { mask: unknown }).mask !== null),
    );
    expect(options.length).toBe(TRIBES.length);
    const xs = options.map((o) => (o as Container).position.x).sort((a, b) => a - b);
    expect(xs[1]! - xs[0]!).toBeCloseTo(72, 5);
    expect(xs[0]! + xs[xs.length - 1]!).toBeCloseTo(1280, 5);
    expect(allTexts(root)).toContain('Choose your tribe');
  });

  it('hides the join link button from joining players', () => {
    screen.destroy();
    useGameStore.setState({
      myPeerId: 'guest-1',
      netMode: 'client',
      lobby: {
        role: 'client',
        code: 'ABC234',
        mode: 'capture',
        totalPlayers: 2,
        aiCount: 0,
        players: [
          { peerId: 'host', name: 'Host', tribeId: Tribe.Cats, isHost: true, ready: true },
          { peerId: 'guest-1', name: 'Guest', tribeId: null, isHost: false, ready: false },
        ],
      },
    });
    screen = new LobbyScreen();
    screen.mount(host);
    const root = (screen as unknown as { root: Container }).root!;
    expect(
      root.children.some((c) => allTexts(c as Container).includes('Copy join link')),
    ).toBe(false);
  });
});
