import { beforeEach, describe, expect, it, afterEach } from 'vitest';
import { Container, Graphics, Text } from 'pixi.js';
import { HudPlayers, PLAYER_ONLINE_COLOR, PLAYER_OFFLINE_COLOR } from '../src/ui/hud/HudPlayers';
import { useGameStore } from '../src/store/gameStore';
import { Tribe } from '../src/game/tribes';
import { type UIHost } from '../src/ui/host';
import { type Player } from '../src/game/players';

function fakeCanvasContext() {
  return { measureText: (s: string) => ({ width: s.length * 8 }) };
}

function makeHost(width = 1280, height = 800): UIHost {
  return {
    app: { screen: { width, height }, stage: new Container() },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

function player(index: number, tribe: Tribe, name: string, isHuman: boolean): Player {
  return {
    index, tribe, isHuman, name,
    resources: { wood: 0, stone: 0, money: 0, ore: 0 },
    score: 0, kills: 0, skills: [], isActive: true,
  };
}

describe('HudPlayers', () => {
  let host: UIHost;
  let root: Container;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    host = makeHost();
    root = new Container();
    useGameStore.setState({
      screen: 'game',
      netMode: 'host',
      localPlayerIndex: 0,
      players: [
        player(0, Tribe.Cats, 'Host', true),
        player(1, Tribe.Warriors, 'Guest', true),
        player(2, Tribe.Barbarians, 'Bot', false),
      ],
      playersOnline: [true, true, true],
    });
  });

  afterEach(() => {
    useGameStore.setState({ screen: 'start', netMode: 'single', players: [], playersOnline: [] });
  });

  const allTexts = (c: Container): string[] => {
    const out: string[] = [];
    const walk = (cc: Container): void => {
      for (const ch of cc.children) {
        if (ch instanceof Text) out.push(String((ch as Text).text));
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(c);
    return out;
  };

  const chipFor = (c: Container, name: string): Container | null => {
    for (const ch of c.children) {
      if (!(ch instanceof Container)) continue;
      if (ch.children.some((x) => x instanceof Text && String((x as Text).text) === name)) return ch as Container;
    }
    return null;
  };

  const hasFill = (chip: Container, color: number): boolean =>
    (chip.children.filter((x) => x instanceof Graphics) as Graphics[]).some((g) =>
      (g as unknown as { context?: { instructions?: { action: string; data?: { style?: { color?: number } } }[] } }).context?.instructions?.some((i) => i.action === 'fill' && i.data?.style?.color === color) ?? false,
    );

  it('is hidden in single-player mode', () => {
    useGameStore.setState({ netMode: 'single' });
    const w = new HudPlayers();
    w.mount(host, root);
    const el = (w as unknown as { el: Container }).el!;
    expect(el.visible).toBe(false);
    w.destroy();
  });

  it('renders each human player name and tribe name, excluding AI', () => {
    const w = new HudPlayers();
    w.mount(host, root);
    const texts = allTexts(root);
    expect(texts.some((t) => t === 'Host')).toBe(true);
    expect(texts.some((t) => t === 'Guest')).toBe(true);
    expect(texts.some((t) => t === 'Cats')).toBe(true);
    expect(texts.some((t) => t === 'Warriors')).toBe(true);
    expect(texts.some((t) => t === 'Bot')).toBe(false);
    expect(texts.some((t) => t === 'Barbarians')).toBe(false);
    w.destroy();
  });

  it('shows a green dot for online players and a red dot for offline players', () => {
    useGameStore.setState({ playersOnline: [true, false, true] });
    const w = new HudPlayers();
    w.mount(host, root);
    const el = (w as unknown as { el: Container }).el!;
    const hostChip = chipFor(el, 'Host')!;
    const guestChip = chipFor(el, 'Guest')!;
    expect(hasFill(hostChip, PLAYER_ONLINE_COLOR)).toBe(true);
    expect(hasFill(guestChip, PLAYER_OFFLINE_COLOR)).toBe(true);
    expect(hasFill(hostChip, PLAYER_OFFLINE_COLOR)).toBe(false);
    w.destroy();
  });
});
