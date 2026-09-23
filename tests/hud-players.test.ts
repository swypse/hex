import { beforeEach, describe, expect, it, afterEach } from 'vitest';
import { Container, Graphics, BitmapText } from 'pixi.js';
import { HudPlayers, PLAYER_ONLINE_COLOR, PLAYER_OFFLINE_COLOR } from '../src/ui/hud/hud-players';
import { useGameStore } from '../src/store/game-store';
import { Tribe } from '../src/game/tribes';
import { SKILLS_BUTTON_SIZE, scoreButtonsPosition } from '../src/ui/layout';
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
        if (ch instanceof BitmapText) out.push(String((ch as BitmapText).text));
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(c);
    return out;
  };

  const chips = (c: Container): Container[] =>
    (c.children.filter((ch) => ch instanceof Container) as Container[]);

  const readoutOf = (chip: Container): Container =>
    (chip.children.find((ch) => ch instanceof Container && (ch as Container).children.some((x) => x instanceof BitmapText)) as Container);

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

  it('renders one compact circle per human player, excluding AI, left-aligned at the achievements row', () => {
    const w = new HudPlayers();
    w.mount(host, root);
    const el = (w as unknown as { el: Container }).el!;
    const cs = chips(el);
    expect(cs.length).toBe(2);

    const y = scoreButtonsPosition(host.app.screen.width, host.app.screen.height).achievements.y;
    expect(el.position.x).toBe(8);
    expect(el.position.y).toBe(y);

    // Same diameter as the skills/achievements buttons, spaced right of each other.
    expect(cs[0]!.position.x).toBe(0);
    expect(cs[1]!.position.x).toBe(SKILLS_BUTTON_SIZE + 6);
    w.destroy();
  });

  it('shows a green dot for online players and a red dot for offline players', () => {
    useGameStore.setState({ playersOnline: [true, false, true] });
    const w = new HudPlayers();
    w.mount(host, root);
    const el = (w as unknown as { el: Container }).el!;
    const cs = chips(el);
    expect(hasFill(cs[0]!, PLAYER_ONLINE_COLOR)).toBe(true);
    expect(hasFill(cs[0]!, PLAYER_OFFLINE_COLOR)).toBe(false);
    expect(hasFill(cs[1]!, PLAYER_OFFLINE_COLOR)).toBe(true);
    w.destroy();
  });

  it('hides the name/tribe readout by default', () => {
    const w = new HudPlayers();
    w.mount(host, root);
    const el = (w as unknown as { el: Container }).el!;
    const readout = readoutOf(chips(el)[0]!);
    expect(readout.visible).toBe(false);
    w.destroy();
  });

  it('reveals white 16px "Name — Tribe" text on hover and hides it on leave', () => {
    const w = new HudPlayers();
    w.mount(host, root);
    const el = (w as unknown as { el: Container }).el!;
    const cs = chips(el);
    const readout = readoutOf(cs[0]!);
    expect(readout.visible).toBe(false);

    (cs[0] as unknown as { emit: (t: string, e: unknown) => void }).emit('pointerover', {} as never);
    expect(readout.visible).toBe(true);
    const texts = allTexts(readout);
    expect(texts).toContain('Host — Cats');
    const label = (readout.children[1] as BitmapText);
    expect(label.text).toBe('Host — Cats');
    expect(label.style.fontSize).toBe(16);
    expect(label.style.fill).toBe(0xffffff);

    (cs[0] as unknown as { emit: (t: string, e: unknown) => void }).emit('pointerout', {} as never);
    expect(readout.visible).toBe(false);
    w.destroy();
  });

  it('keeps the readout visible while it is itself hovered', () => {
    const w = new HudPlayers();
    w.mount(host, root);
    const el = (w as unknown as { el: Container }).el!;
    const cs = chips(el);
    const readout = readoutOf(cs[0]!);
    (cs[0] as unknown as { emit: (t: string, e: unknown) => void }).emit('pointerover', {} as never);
    (cs[0] as unknown as { emit: (t: string, e: unknown) => void }).emit('pointerout', {} as never);
    (readout as unknown as { emit: (t: string, e: unknown) => void }).emit('pointerover', {} as never);
    expect(readout.visible).toBe(true);
    w.destroy();
  });
});