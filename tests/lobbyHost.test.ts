import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { LobbyScreen } from '../src/ui/screens/LobbyScreen';
import { gameController } from '../src/controller/gameController';
import { TRIBES, Tribe } from '../src/game/tribes';
import { useGameStore } from '../src/store/gameStore';
import { type UIHost } from '../src/ui/host';
import { Button } from '../src/ui/kit/button';

function makeHost(): UIHost {
  return {
    app: { screen: { width: 1280, height: 800 } },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

type KeyboardEventLike = { key: string; preventDefault: () => void };

describe('LobbyScreen host keyboard navigation', () => {
  let screen: LobbyScreen;
  let host: ReturnType<typeof makeHost>;
  let keyHandler: ((e: KeyboardEventLike) => void) | null;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as Record<string, unknown>).document = { activeElement: null };
    (globalThis as Record<string, unknown>).HTMLInputElement = class {};
    keyHandler = null;
    const win = (globalThis as { window: { addEventListener: (t: string, cb: unknown) => void; removeEventListener: (t: string, cb: unknown) => void } }).window;
    win.addEventListener = (t, cb) => { if (t === 'keydown') keyHandler = cb as (e: KeyboardEventLike) => void; };
    win.removeEventListener = () => {};

    host = makeHost();
    screen = new LobbyScreen();
    screen.mount(host);
    (screen as unknown as { view: string }).view = 'host';
    (screen as unknown as { render: () => void }).render();
  });

  afterEach(() => {
    screen.destroy();
    vi.restoreAllMocks();
  });

  const key = (k: string): void => keyHandler!({ key: k, preventDefault: () => {} });
  const state = (): {
    focus: number;
    tribe: number;
    humans: number;
    aiCount: number;
    mode: string;
    view: string;
  } => {
    const s = screen as unknown as { focus: number; tribe: number; humans: number; aiCount: number; mode: string; view: string };
    return { focus: s.focus, tribe: s.tribe, humans: s.humans, aiCount: s.aiCount, mode: s.mode, view: s.view };
  };

  it('moves focus up/down across the groups', () => {
    expect(state().focus).toBe(0);
    key('ArrowDown');
    expect(state().focus).toBe(1);
    key('ArrowDown');
    expect(state().focus).toBe(2);
    key('ArrowUp');
    expect(state().focus).toBe(1);
  });

  it('changes the value within the focused group with left/right', () => {
    expect(state().tribe).toBe(TRIBES[0]!.id);
    key('ArrowRight');
    expect(state().tribe).toBe(TRIBES[1]!.id);
    key('ArrowLeft');
    expect(state().tribe).toBe(TRIBES[0]!.id);

    key('ArrowDown'); // focus humans
    const humansBefore = state().humans;
    key('ArrowRight');
    expect(state().humans).toBe(humansBefore + 1);

    key('ArrowDown'); // focus ai
    const aiBefore = state().aiCount;
    const aiOpts = Array.from({ length: 7 - state().humans }, (_, i) => i);
    key('ArrowRight');
    expect(state().aiCount).toBe(aiOpts[(aiOpts.indexOf(aiBefore) + 1) % aiOpts.length]);

    key('ArrowDown'); // focus mode
    key('ArrowRight');
    expect(state().mode).toBe('turns30');
  });

  it('clamps AI count when humans change reduces available slots', () => {
    (screen as unknown as { humans: number }).humans = 4;
    (screen as unknown as { aiCount: number }).aiCount = 1;
    key('ArrowDown'); // focus humans
    key('ArrowLeft'); // 4 -> 3
    expect(state().humans).toBe(3);
    expect(state().aiCount).toBe(1);
  });

  it('requires at least 2 human players in multiplayer', () => {
    key('ArrowDown'); // focus humans
    (screen as unknown as { humans: number }).humans = 2;
    key('ArrowLeft');
    expect(state().humans).toBeGreaterThanOrEqual(2);
    const root = (screen as unknown as { root: Container }).root!;
    const texts = (c: Container): string[] => (c as Container).children.filter((ch) => ch instanceof Text).map((ch) => String((ch as Text).text));
    const humanButtons = root.children.filter((c) => c instanceof Button && (c as Container).position.y === 342);
    expect(humanButtons.map((b) => texts(b as Container).find((t) => /^\d$/.test(t))).sort()).toEqual(['2', '3', '4', '5', '6']);
  });

  it('creates a room on Enter', () => {
    const spy = vi.spyOn(gameController, 'hostGame').mockReturnValue('ABCDEF');
    key('Enter');
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ mode: state().mode, aiCount: state().aiCount, tribe: state().tribe }),
    );
  });

  it('goes back to the menu on Backspace', () => {
    key('Backspace');
    expect(state().view).toBe('menu');
  });

  it('places the back button as the last navigable button below create room', () => {
    const root = (screen as unknown as { root: Container }).root!;
    const texts = (c: Container): string[] => (c as Container).children.filter((ch) => ch instanceof Text).map((ch) => String((ch as Text).text));
    const create = root.children.find((c) => texts(c as Container).includes('Create room')) as Container;
    const back = root.children.find((c) => texts(c as Container).includes('Back')) as Container;
    expect(create).toBeDefined();
    expect(back).toBeDefined();
    expect(back.position.y).toBeGreaterThan(create.position.y);
    expect(back.position.x).toBe(1280 / 2 - 48);
  });

  it('centers the create room button', () => {
    const root = (screen as unknown as { root: Container }).root!;
    const texts = (c: Container): string[] => (c as Container).children.filter((ch) => ch instanceof Text).map((ch) => String((ch as Text).text));
    const create = root.children.find((c) => texts(c as Container).includes('Create room')) as Container;
    expect(create).toBeDefined();
    expect(create.position.x).toBe(1280 / 2 - 120);
  });

  it('renders the tribe choice as circular options with icons', () => {
    const root = (screen as unknown as { root: Container }).root!;
    const options = root.children.filter((c) =>
      (c as Container).children.some((ch) => ch instanceof Sprite && (ch as { mask: unknown }).mask !== null),
    );
    expect(options.length).toBe(TRIBES.length);
  });

  it('spaces the tribe options like the Choose your tribe screen', () => {
    const root = (screen as unknown as { root: Container }).root!;
    const options = root.children.filter((c) =>
      (c as Container).children.some((ch) => ch instanceof Sprite && (ch as { mask: unknown }).mask !== null),
    );
    const xs = options.map((o) => (o as Container).position.x).sort((a, b) => a - b);
    expect(xs[1]! - xs[0]!).toBeCloseTo(72, 5);
    expect(xs[0]! + xs[xs.length - 1]!).toBeCloseTo(1280, 5);
  });

  it('centers the human player and AI opponent buttons', () => {
    const root = (screen as unknown as { root: Container }).root!;
    const buttons = root.children.filter((c) => c instanceof Button) as Container[];
    const humanButtons = buttons.filter((b) => b.position.y === 342);
    const aiButtons = buttons.filter((b) => b.position.y === 442);
    expect(humanButtons.length).toBe(5);
    expect(aiButtons.length).toBe(5);
    const centered = (btns: Container[]): boolean => {
      const xs = btns.map((b) => b.position.x);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      return Math.abs(maxX + 56 - 2 * 640 + minX) < 0.5;
    };
    expect(centered(humanButtons)).toBe(true);
    expect(centered(aiButtons)).toBe(true);
  });

  it('selects the create room button via arrow keys and creates the room with Enter', () => {
    const spy = vi.spyOn(gameController, 'hostGame').mockReturnValue('ABCDEF');
    key('ArrowDown');
    key('ArrowDown');
    key('ArrowDown');
    key('ArrowDown');
    expect(state().focus).toBe(4);
    const root = (screen as unknown as { root: Container }).root!;
    const texts = (c: Container): string[] => (c as Container).children.filter((ch) => ch instanceof Text).map((ch) => String((ch as Text).text));
    const create = root.children.find((c) => texts(c as Container).includes('Create room')) as Button;
    expect(create.selected).toBe(true);
    key('Enter');
    expect(spy).toHaveBeenCalled();
  });

  it('reaches the back button last via arrow keys and triggers it with Enter', () => {
    key('ArrowDown');
    key('ArrowDown');
    key('ArrowDown');
    key('ArrowDown');
    key('ArrowDown');
    expect(state().focus).toBe(5);
    key('Enter');
    expect(state().view).toBe('menu');
  });
});

describe('LobbyScreen menu keyboard navigation', () => {
  let screen: LobbyScreen;
  let host: ReturnType<typeof makeHost>;
  let keyHandler: ((e: KeyboardEventLike) => void) | null;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    keyHandler = null;
    const win = (globalThis as { window: { addEventListener: (t: string, cb: unknown) => void; removeEventListener: (t: string, cb: unknown) => void } }).window;
    win.addEventListener = (t, cb) => { if (t === 'keydown') keyHandler = cb as (e: KeyboardEventLike) => void; };
    win.removeEventListener = () => {};

    host = makeHost();
    screen = new LobbyScreen();
    screen.mount(host);
  });

  afterEach(() => {
    screen.destroy();
    vi.restoreAllMocks();
  });

  const key = (k: string): void => keyHandler!({ key: k, preventDefault: () => {} });

  it('moves the highlighted menu button with up/down and triggers it with Enter', () => {
    const s = screen as unknown as { menuIndex: number; view: string };
    expect(s.menuIndex).toBe(0);
    key('ArrowDown');
    expect(s.menuIndex).toBe(1);
    key('ArrowDown');
    expect(s.menuIndex).toBe(2);
    key('ArrowUp');
    expect(s.menuIndex).toBe(1);

    // Enter on "Join game" opens the join view.
    key('Enter');
    expect(s.view).toBe('join');
  });

  it('goes back to the start screen on Backspace', () => {
    useGameStore.setState({ screen: 'lobby' });
    key('Backspace');
    expect(useGameStore.getState().screen).toBe('start');
  });

  it('places the menu back button as the last button below the others', () => {
    const root = (screen as unknown as { root: Container }).root!;
    const back = root.children.find((c) =>
      (c as Container).children.some((ch) => ch instanceof Text && String((ch as Text).text) === 'Back'),
    ) as Container;
    expect(back).toBeDefined();
    const cx = 1280 / 2;
    expect(back.position.x).toBe(cx - 120);
    expect(back.position.y).toBe(300);
  });
});

class FakeImage {
  src = '';
  onload: (() => void) | null = null;
  static instances: FakeImage[] = [];

  constructor() {
    FakeImage.instances.push(this);
  }
}

describe('LobbyScreen host tribe icons use tribe codes', () => {
  let screen: LobbyScreen;
  let host: ReturnType<typeof makeHost>;
  let keyHandler: ((e: KeyboardEventLike) => void) | null;
  const originalImage = globalThis.Image;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    FakeImage.instances = [];
    (globalThis as { Image?: unknown }).Image = FakeImage;
    (globalThis as Record<string, unknown>).document = { activeElement: null };
    (globalThis as Record<string, unknown>).HTMLInputElement = class {};
    keyHandler = null;
    const win = (globalThis as { window: { addEventListener: (t: string, cb: unknown) => void; removeEventListener: (t: string, cb: unknown) => void } }).window;
    win.addEventListener = (t, cb) => { if (t === 'keydown') keyHandler = cb as (e: KeyboardEventLike) => void; };
    win.removeEventListener = () => {};

    host = makeHost();
    screen = new LobbyScreen();
    screen.mount(host);
    (screen as unknown as { view: string }).view = 'host';
    (screen as unknown as { render: () => void }).render();
  });

  afterEach(() => {
    screen.destroy();
    vi.restoreAllMocks();
    (globalThis as { Image?: unknown }).Image = originalImage;
  });

  it('requests the code-based icon files for all tribes', () => {
    const srcs = FakeImage.instances.map((i) => i.src);
    expect(srcs.some((s) => s.includes('cats-icon.png'))).toBe(true);
    expect(srcs.some((s) => s.includes('forest-icon.png'))).toBe(true);
    expect(srcs.some((s) => s.includes('aqua-icon.png'))).toBe(true);
  });
});

describe('LobbyScreen client room tribe selection', () => {
  let screen: LobbyScreen;
  let host: ReturnType<typeof makeHost>;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({
        getContext: () => ({
          measureText: (s: string) => ({ width: s.length * 8 }),
        }),
        width: 0,
        height: 0,
      }),
    };
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    host = makeHost();
    screen = new LobbyScreen();
    screen.mount(host);
  });

  afterEach(() => {
    screen.destroy();
    useGameStore.setState({ lobby: null, myPeerId: '' });
    vi.restoreAllMocks();
  });

  const setClientRoom = (): void => {
    useGameStore.setState({
      lobby: {
        role: 'client',
        code: 'ABCDEF',
        mode: 'capture',
        totalPlayers: 2,
        aiCount: 0,
        players: [
          { peerId: 'host', name: 'Host', tribeId: Tribe.Cats, isHost: true, ready: true },
          { peerId: 'guest-1', name: 'Guest', tribeId: Tribe.Warriors, isHost: false, ready: true },
        ],
      },
      myPeerId: 'guest-1',
    });
    (screen as unknown as { render: () => void }).render();
  };

  const optionFor = (tribeName: string): Container =>
    ((screen as unknown as { root: Container }).root!).children.find((c) =>
      (c as Container).children.some((ch) => ch instanceof Text && String((ch as Text).text) === tribeName),
    ) as Container;

  const hasSelectedStroke = (opt: Container): boolean =>
    (opt.children.filter((c) => c instanceof Graphics) as Graphics[]).some(
      (g) => (g as unknown as { context?: { instructions?: { action: string }[] } }).context?.instructions?.some((i) => i.action === 'stroke') ?? false,
    );

  it("highlights the client's own tribe and not the host's", () => {
    setClientRoom();
    const clientOpt = optionFor('Warriors');
    const hostOpt = optionFor('Cats');
    expect(clientOpt).toBeDefined();
    expect(hostOpt).toBeDefined();
    expect(hasSelectedStroke(clientOpt)).toBe(true);
    expect(hasSelectedStroke(hostOpt)).toBe(false);
  });

  it('keeps the client’s picked tribe visible in the row', () => {
    setClientRoom();
    expect(optionFor('Warriors')).toBeDefined();
  });

  const hasText = (text: string): boolean =>
    ((screen as unknown as { root: Container }).root!).children.some(
      (c) => c instanceof Text && String((c as Text).text) === text,
    );

  it('shows "Waiting for game start..." once the joining player is ready', () => {
    setClientRoom();
    expect(hasText('Waiting for game start...')).toBe(true);
    expect(hasText('Pick a tribe to become ready.')).toBe(false);
  });

  it('hides the waiting text and keeps tribe options interactive before ready', () => {
    setClientRoom();
    useGameStore.setState({
      lobby: {
        role: 'client',
        code: 'ABCDEF',
        mode: 'capture',
        totalPlayers: 2,
        aiCount: 0,
        players: [
          { peerId: 'host', name: 'Host', tribeId: Tribe.Cats, isHost: true, ready: true },
          { peerId: 'guest-1', name: 'Guest', tribeId: Tribe.Warriors, isHost: false, ready: false },
        ],
      },
      myPeerId: 'guest-1',
    });
    (screen as unknown as { render: () => void }).render();
    expect(hasText('Waiting for game start...')).toBe(false);
    const opt = optionFor('Warriors');
    expect((opt as { eventMode: string }).eventMode).not.toBe('none');
    expect((opt as { alpha: number }).alpha).toBe(1);
  });

  it('locks the joining player’s tribe options after they are ready', () => {
    setClientRoom();
    const opt = optionFor('Warriors');
    expect((opt as { eventMode: string }).eventMode).toBe('none');
    expect((opt as { alpha: number }).alpha).toBeLessThan(1);
  });

  it('lays out all six tribe circles like the single-player picker', () => {
    setClientRoom();
    const root = (screen as unknown as { root: Container }).root!;
    const options = root.children.filter((c) =>
      (c as Container).children.some((ch) => ch instanceof Sprite && (ch as { mask: unknown }).mask !== null),
    );
    expect(options.length).toBe(TRIBES.length);
    const xs = options.map((o) => (o as Container).position.x).sort((a, b) => a - b);
    expect(xs[1]! - xs[0]!).toBeCloseTo(72, 5);
    expect(xs[0]! + xs[xs.length - 1]!).toBeCloseTo(1280, 5);
  });

  it('dims a tribe already taken by the host so it cannot be picked', () => {
    setClientRoom();
    useGameStore.setState({
      lobby: {
        role: 'client',
        code: 'ABCDEF',
        mode: 'capture',
        totalPlayers: 2,
        aiCount: 0,
        players: [
          { peerId: 'host', name: 'Host', tribeId: Tribe.Cats, isHost: true, ready: true },
          { peerId: 'guest-1', name: 'Guest', tribeId: Tribe.Warriors, isHost: false, ready: false },
        ],
      },
      myPeerId: 'guest-1',
    });
    (screen as unknown as { render: () => void }).render();
    const hostOpt = optionFor('Cats');
    expect((hostOpt as { eventMode: string }).eventMode).toBe('none');
    expect((hostOpt as { alpha: number }).alpha).toBeLessThan(1);
    expect(hasSelectedStroke(hostOpt)).toBe(false);
    const guestOpt = optionFor('Warriors');
    expect((guestOpt as { eventMode: string }).eventMode).not.toBe('none');
    expect((guestOpt as { alpha: number }).alpha).toBe(1);
    expect(hasSelectedStroke(guestOpt)).toBe(true);
  });
});
