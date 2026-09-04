import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Container, Text } from 'pixi.js';
import { useGameStore } from '../src/store/gameStore';
import { HudTurn } from '../src/ui/hud/HudTurn';
import { Tribe } from '../src/game/tribes';
import { START_RESOURCES } from '../src/game/resources';
import type { Player } from '../src/game/players';
import { type UIHost } from '../src/ui/host';

function fakeCanvasContext() {
  return {
    measureText: (s: string) => ({ width: s.length * 8, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 8, actualBoundingBoxAscent: 12, actualBoundingBoxDescent: 3 }),
  };
}

function makePlayer(index: number, tribe: Tribe, knownTribes: Tribe[]): Player {
  return {
    index,
    tribe,
    isHuman: index === 0,
    name: `P${index}`,
    resources: { ...START_RESOURCES },
    score: 0,
    kills: 0,
    skills: [],
    isActive: true,
    knownTribes,
  };
}

function makeHost(width = 1280, height = 800): UIHost {
  return {
    app: { screen: { width, height } },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

describe('HudTurn waiting label', () => {
  let root: Container;
  let turn: HudTurn | null = null;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    root = new Container();
    useGameStore.setState({
      screen: 'start',
      players: [],
      turn: 1,
      currentPlayerIndex: 0,
      localPlayerIndex: 0,
      gameOver: false,
      texturesLoading: false,
    });
  });

  afterEach(() => {
    turn?.destroy();
    turn = null;
  });

  function startWaiting(knownOther: boolean): void {
    const other = knownOther ? Tribe.Cats : Tribe.Aqua;
    const players = [
      makePlayer(0, Tribe.Villagers, [Tribe.Villagers, ...(knownOther ? [Tribe.Cats] : [])]),
      makePlayer(1, other, [other]),
    ];
    useGameStore.setState({
      screen: 'game',
      mode: 'capture',
      players,
      localPlayerIndex: 0,
      currentPlayerIndex: 1,
      aiActive: true,
      turn: 2,
    });
  }

  const textOf = (): string => (turn as unknown as { text: { text: string } }).text!.text;

  it('shows the tribe name when the waiting tribe is known', () => {
    startWaiting(true);
    turn = new HudTurn();
    turn.mount(makeHost(), root);
    expect(textOf()).toContain('Waiting for Cats turn...');
  });

  it('shows Unknown tribe when the waiting tribe has not been met yet', () => {
    startWaiting(false);
    turn = new HudTurn();
    turn.mount(makeHost(), root);
    expect(textOf()).toContain('Waiting for Unknown tribe turn...');
  });
});
