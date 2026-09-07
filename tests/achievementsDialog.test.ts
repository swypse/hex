import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Container, Text } from 'pixi.js';
import { AchievementsDialog } from '../src/ui/overlays/AchievementsDialog';
import { useGameStore } from '../src/store/gameStore';
import { type UIHost } from '../src/ui/host';
import { START_RESOURCES } from '../src/game/resources';
import { Tribe } from '../src/game/tribes';
import { t } from '../src/i18n';
import type { Player } from '../src/game/players';

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
    app: { screen: { width: 800, height: 600 } },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

function makePlayer(achievements: string[]): Player {
  return {
    index: 0,
    tribe: Tribe.Villagers,
    isHuman: true,
    name: 'P',
    resources: { ...START_RESOURCES },
    score: 0,
    kills: 0,
    skills: [],
    isActive: true,
    achievements: achievements as Player['achievements'],
  } as Player;
}

describe('AchievementsDialog', () => {
  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 40 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    useGameStore.setState({ localPlayerIndex: 0, players: [makePlayer(['bonusHunter'])], overlay: null });
  });

  afterEach(() => {
    useGameStore.setState({ players: [], localPlayerIndex: 0, overlay: null });
  });

  const allTexts = (c: Container): string[] => {
    const out: string[] = [];
    const walk = (n: Container): void => {
      for (const ch of n.children) {
        if (ch instanceof Text) out.push(String((ch as Text).text));
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(c);
    return out;
  };

  it('lists every achievement with its title and the unlocked name', () => {
    const host = makeHost();
    const root = new Container();
    const dialog = new AchievementsDialog();
    dialog.mount(host, root);
    const popupRoot = root.children[0] as Container;
    const texts = allTexts(popupRoot);
    expect(texts).toContain(t('ach.dialog-title'));
    expect(texts).toContain(t('ach.bonusHunter.name'));
    dialog.destroy();
  });

  it('opens a detail popup with the description when a row is tapped', () => {
    const host = makeHost();
    const root = new Container();
    const dialog = new AchievementsDialog();
    dialog.mount(host, root);
    expect(root.children.length).toBe(1);

    const card = (root.children[0] as Container).children[2] as Container;
    const content = (card.children[2] as Container).children[2] as Container;
    const firstRow = content.children[0] as Container;
    (firstRow as unknown as { emit: (e: string) => void }).emit('pointertap');

    expect(root.children.length).toBe(2);
    const texts = allTexts(root.children[1] as Container);
    expect(texts).toContain(t('ach.bonusHunter.name'));
    expect(texts).toContain(t('ach.bonusHunter.desc'));
    expect(texts).toContain(t('ach.scoreLine', { points: 200 }));

    const detailCard = (root.children[1] as Container).children[2] as Container;
    const detailFooter = detailCard.children[3] as Container;
    (detailFooter.children[0] as unknown as { emit: (e: string) => void }).emit('pointertap');
    expect(root.children.length).toBe(1);
    dialog.destroy();
  });

  it('lists opened achievements before unopened ones', () => {
    const host = makeHost();
    const root = new Container();
    const dialog = new AchievementsDialog();
    dialog.mount(host, root);
    const texts = allTexts(root.children[0] as Container);
    const firstOpened = texts.indexOf(t('ach.bonusHunter.name'));
    const firstUnopened = texts.indexOf(t('ach.greatConnector.name'));
    expect(firstOpened).toBeGreaterThanOrEqual(0);
    expect(firstUnopened).toBeGreaterThan(firstOpened);
    dialog.destroy();
  });

  it('closes the overlay when the close button is tapped', () => {
    const host = makeHost();
    const root = new Container();
    const dialog = new AchievementsDialog();
    dialog.mount(host, root);
    const card = (root.children[0] as Container).children[2] as Container;
    const footer = card.children[3] as Container;
    const closeBtn = footer.children[0];
    (closeBtn as { emit: (e: string) => void }).emit('pointertap');
    expect(useGameStore.getState().overlay).toBeNull();
    dialog.destroy();
  });
});
