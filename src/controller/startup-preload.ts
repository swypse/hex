import { ensureBuildingsAtlas } from '../render/buildings-atlas';
import { ensureTerrainAtlas } from '../render/terrain-atlas';
import { ensureTribeAtlas } from '../render/tribe-atlas';
import { saveRepository } from '../storage/save-game';
import { TRIBES } from '../game/tribes';
import { prewarmSizedFonts } from '../gfx/bitmap-fonts';
import { forEachIdle, whenIdle } from '../util/time-slice';

/** Tribe atlas codes of the saved game, if any: "Resume" is the common way into
 *  a game, and it needs exactly these. */
function savedGameTribeCodes(): string[] {
  const snap = saveRepository.load();
  if (!snap) return [];
  const codes = new Set<string>();
  for (const player of snap.players) {
    const code = TRIBES.find((t) => t.id === player.tribe)?.code;
    if (code) codes.add(code);
  }
  return [...codes];
}

/** Work that does not depend on a running game, done while the start screen is
 *  showing and the page is idle: bake the UI fonts and load (fetch, decode, copy
 *  to a canvas) the image atlases every game needs, so pressing Resume or Start
 *  does not pay for them in one long task. Everything is idempotent: a loader
 *  that already ran returns its cached promise. */
export async function preloadStartupWork(): Promise<void> {
  const loaders: (() => Promise<void>)[] = [
    ensureTerrainAtlas,
    ensureBuildingsAtlas,
    ...savedGameTribeCodes().map((code) => () => ensureTribeAtlas(code)),
  ];
  await Promise.all([
    prewarmSizedFonts(),
    forEachIdle(loaders, (load) => void load(), whenIdle),
  ]);
}
