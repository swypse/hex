import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { HudTribes } from '../src/ui/hud/HudTribes';
import { useGameStore } from '../src/store/gameStore';
import { UNKNOWN_TRIBE_COLOR } from '../src/game/discovery';
import { Tribe } from '../src/game/tribes';
import { type Player } from '../src/game/players';
import { type UIHost } from '../src/ui/host';

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

function player(
  index: number,
  tribe: Tribe,
  name: string,
  isActive = true,
  knownTribes: Tribe[] = [],
): Player {
  return {
    index, tribe, isHuman: false, name,
    resources: { wood: 0, stone: 0, money: 0, ore: 0 },
    score: 0, kills: 0, skills: [], isActive,
    knownTribes,
  };
}

function setGame(local: Player, enemies: Player[]): void {
  useGameStore.setState({
    screen: 'game',
    localPlayerIndex: local.index,
    players: [local, ...enemies],
  });
}

describe('HudTribes', () => {
  let host: UIHost;
  let root: Container;
  let widget: HudTribes | null = null;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    host = makeHost();
    root = new Container();
    useGameStore.setState({ screen: 'start', players: [], localPlayerIndex: 0 });
  });

  afterEach(() => {
    widget?.destroy();
    widget = null;
    vi.restoreAllMocks();
    useGameStore.setState({ screen: 'start', players: [], localPlayerIndex: 0 });
  });

  const el = (): Container => (widget as unknown as { el: Container }).el!;

  const chips = (): Container[] =>
    el().children.filter((c): c is Container => c instanceof Container);

  const spritesIn = (chip: Container): number =>
    chip.children.filter((c) => c instanceof Sprite).length;

  const textOf = (chip: Container): string[] =>
    chip.children.filter((c): c is Text => c instanceof Text).map((c) => String(c.text));

  const hasFill = (chip: Container, color: number): boolean =>
    (chip.children.filter((c) => c instanceof Graphics) as Graphics[]).some((g) =>
      (g as unknown as { context?: { instructions?: { action: string; data?: { style?: { color?: number } } }[] } }).context?.instructions?.some((i) => i.action === 'fill' && i.data?.style?.color === color) ?? false,
    );

  it('is hidden outside the game screen', () => {
    useGameStore.setState({ screen: 'start' });
    widget = new HudTribes();
    widget.mount(host, root);
    expect(el().visible).toBe(false);
  });

  it('draws one chip per opposing player and excludes the local tribe', () => {
    setGame(
      player(0, Tribe.Cats, 'Cats', true, [Tribe.Cats, Tribe.Warriors]),
      [
        player(1, Tribe.Warriors, 'Warriors'),
        player(2, Tribe.Forest, 'Forest'),
      ],
    );
    widget = new HudTribes();
    widget.mount(host, root);
    expect(el().visible).toBe(true);
    expect(chips()).toHaveLength(2);
  });

  it('shows the tribe icon for an explored tribe', () => {
    setGame(
      player(0, Tribe.Cats, 'Cats', true, [Tribe.Cats, Tribe.Warriors]),
      [player(1, Tribe.Warriors, 'Warriors')],
    );
    widget = new HudTribes();
    widget.mount(host, root);
    const chip = chips()[0]!;
    expect(spritesIn(chip)).toBe(1);
    expect(textOf(chip)).toEqual([]);
    expect(chip.alpha).toBe(1);
  });

  it('shows a grey circle with a white question mark for an unexplored tribe', () => {
    setGame(
      player(0, Tribe.Cats, 'Cats', true, [Tribe.Cats]),
      [player(1, Tribe.Forest, 'Forest')],
    );
    widget = new HudTribes();
    widget.mount(host, root);
    const chip = chips()[0]!;
    expect(spritesIn(chip)).toBe(0);
    expect(textOf(chip)).toEqual(['?']);
    expect(hasFill(chip, UNKNOWN_TRIBE_COLOR)).toBe(true);
    const q = chip.children.find((c): c is Text => c instanceof Text)!;
    expect((q.style as { fill?: string | number }).fill).toBe(0xffffff);
  });

  it('dims an eliminated player\'s chip to 0.3 alpha', () => {
    setGame(
      player(0, Tribe.Cats, 'Cats', true, [Tribe.Cats, Tribe.Warriors, Tribe.Aqua]),
      [
        player(1, Tribe.Warriors, 'Warriors'),
        player(2, Tribe.Aqua, 'Aqua', false),
      ],
    );
    widget = new HudTribes();
    widget.mount(host, root);
    const [warriors, aqua] = chips();
    expect(warriors!.alpha).toBe(1);
    expect(aqua!.alpha).toBeCloseTo(0.3, 5);
  });

  it('centers the row under the resource panel', () => {
    setGame(
      player(0, Tribe.Cats, 'Cats', true, [Tribe.Cats]),
      [player(1, Tribe.Warriors, 'Warriors')],
    );
    widget = new HudTribes();
    widget.mount(host, root);
    expect(el().position.x).toBe(640);
    expect(el().position.y).toBe(52);
    // A single chip sits at its own centre.
    expect(chips()[0]!.position.x).toBe(0);
  });
});
