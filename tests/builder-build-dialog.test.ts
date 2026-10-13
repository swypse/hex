import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Text } from 'pixi.js';
import { BuilderExtraKind, BuildingKind, OverlayKind, SelectionKind } from '@enums';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { makeTestMap } from './helpers/test-map';
import { gameController } from '../src/controller/game-controller';
import { useGameStore } from '../src/store/game-store';
import { Button } from '../src/ui/kit/button';
import { BuilderBuildDialog } from '../src/ui/overlays/builder-build-dialog';
import type { UIHost } from '../src/ui/host';

/** Every Container (recursively) matching a predicate. */
function collect(c: Container, pred: (x: Container) => boolean, out: Container[] = []): Container[] {
  for (const ch of c.children) {
    if (!(ch instanceof Container)) continue;
    if (pred(ch)) out.push(ch);
    collect(ch, pred, out);
  }
  return out;
}

describe('BuilderBuildDialog', () => {
  let root: Container;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({
        getContext: () => ({
          measureText: (s: string) => ({
            width: s.length * 8, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 8,
            actualBoundingBoxAscent: 12, actualBoundingBoxDescent: 3,
          }),
        }),
        width: 0,
        height: 0,
      }),
    };
    useGameStore.setState({ overlay: { kind: OverlayKind.BUILDER_BUILD } });
    root = new Container();
    const host = { app: { screen: { width: 800, height: 600 } }, screenLayer: new Container(), overlayLayer: new Container() } as unknown as UIHost;
    new BuilderBuildDialog().mount(host, root);
  });

  afterEach(() => {
    useGameStore.setState({ overlay: null });
    vi.restoreAllMocks();
  });

  it('keeps only the cancel button; builds are icon buttons', () => {
    const buttons = collect(root, (c) => c instanceof Button);
    expect(buttons).toHaveLength(1);
    const icons = collect(root, (c) => c.eventMode === 'static' && c.cursor === 'pointer' && !(c instanceof Button));
    expect(icons).toHaveLength(5);
  });

  it('starts placement of the clicked kind', () => {
    const begin = vi.spyOn(gameController.actions, 'beginBuilderPlacement').mockImplementation(() => {});
    const icons = collect(root, (c) => c.eventMode === 'static' && c.cursor === 'pointer' && !(c instanceof Button));
    icons[0]!.emit('pointertap', {} as never);
    icons[3]!.emit('pointertap', {} as never);
    icons[4]!.emit('pointertap', {} as never);
    expect(begin).toHaveBeenNthCalledWith(1, BuildingKind.SAWMILL);
    expect(begin).toHaveBeenNthCalledWith(2, BuilderExtraKind.BRIDGE);
    expect(begin).toHaveBeenNthCalledWith(3, BuilderExtraKind.ROAD);
  });

  it('disables kinds with no place to build', () => {
    // A map with no owned buildable cell: nothing can be built.
    const map = makeTestMap(2);
    vi.spyOn(gameController, 'getMap').mockReturnValue(map);
    useGameStore.setState({
      selection: { kind: SelectionKind.TILE, q: 0, r: 0 },
      players: buildPlayers(Tribe.Villagers, 1, new SeededRandom(1)),
      localPlayerIndex: 0,
    });
    const fresh = new Container();
    const host = { app: { screen: { width: 800, height: 600 } }, screenLayer: new Container(), overlayLayer: new Container() } as unknown as UIHost;
    new BuilderBuildDialog().mount(host, fresh);
    const active = collect(fresh, (c) => c.eventMode === 'static' && c.cursor === 'pointer' && !(c instanceof Button));
    expect(active).toHaveLength(0);
    // The five circles are still drawn, faded.
    expect(collect(fresh, (c) => c.alpha === 0.4)).toHaveLength(5);
    useGameStore.setState({ selection: null, players: [] });
  });

  it('cancel closes the overlay', () => {
    const [cancel] = collect(root, (c) => c instanceof Button) as Button[];
    cancel!.trigger();
    expect(useGameStore.getState().overlay).toBeNull();
  });
});
