import type { AttackUnitPre, GameEvent } from '../game/events';
import type { Axial } from '../game/hex';

export interface AttackPresenceParticipant {
  unitId: string;
  tile: Axial;
  pre: AttackUnitPre;
}

export function attackPresenceParticipants(events: GameEvent[]): Map<string, AttackPresenceParticipant> {
  const out = new Map<string, AttackPresenceParticipant>();
  const add = (unitId: string, tile: Axial, pre: AttackUnitPre): void => {
    const p = { unitId, tile, pre };
    if (!out.has(p.unitId)) out.set(p.unitId, p);
  };
  for (const e of events) {
    if (e.type !== 'attack') continue;
    const a = e.attackerPre;
    const t = e.targetPre;
    if (e.targetDied && t) add(e.targetId, e.targetTile, t);
    if (!a) continue;
    if (e.attackerDied) {
      add(e.attackerId, e.attackerTile, a);
    } else if (
      e.targetDied &&
      t &&
      a.shipLevel === undefined &&
      t.shipLevel === undefined &&
      a.type !== 'archer' &&
      a.type !== 'catapult' &&
      a.type !== 'pirate' &&
      t.type !== 'pirate'
    ) {
      add(e.attackerId, e.attackerTile, a);
    }
  }
  return out;
}
