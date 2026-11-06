import { axialKey } from '../../map/hex';
import type { MapTile } from '../../map/map-gen';
import type { WaterAtlas } from './analyze-water';
import { portSiteValue } from './port-site-value';

/** A site is worth a port of its own only from this value on (ocean or enemy access). */
export const OPEN_PORT_VALUE = 6;

/** The best site for a port that is worth building for its own sake: opens the ocean or a
 *  way to enemy villages, in a body where the player has no port yet. */
export function bestOpenPortSite(atlas: WaterAtlas, sites: MapTile[]): MapTile | null {
  let best: MapTile | null = null;
  let bestValue = OPEN_PORT_VALUE - 1;
  for (const s of sites) {
    const id = atlas.body.get(axialKey(s));
    if (id === undefined || atlas.ported.has(id)) continue;
    const v = portSiteValue(atlas, s);
    if (v > bestValue) {
      best = s;
      bestValue = v;
    }
  }
  return best;
}
