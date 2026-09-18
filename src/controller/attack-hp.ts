import { GameEvent } from '../game/events';

/** HP the given unit has just before `e` resolves (as recorded by the sim). */
function preHpOf(e: GameEvent, unitId: string): number | undefined {
  if (e.type !== 'attack') return undefined;
  if (e.attackerId === unitId) return e.attackerPre?.hp;
  if (e.targetId === unitId) return e.targetPre?.hp;
  return undefined;
}

/** HP to show for every unit involved in an attack before the batch starts.
 *  This is the unit's hp at its first involvement, which is its true pre-batch
 *  hp (nothing else in the batch could have damaged it earlier). */
export function initialAttackHpOverrides(events: GameEvent[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of events) {
    if (e.type !== 'attack') continue;
    for (const unitId of [e.attackerId, e.targetId]) {
      if (out.has(unitId)) continue;
      const hp = preHpOf(e, unitId);
      if (hp !== undefined) out.set(unitId, hp);
    }
  }
  return out;
}

/** HP each unit of the attack at `index` should show once it is presented:
 *  the unit's pre-hp at its next attack in the batch, or null (the real sim
 *  hp) when it has no further attack here. */
export function hpOverrideAfterAttack(
  events: GameEvent[],
  index: number,
): { unitId: string; hp: number | null }[] {
  const e = events[index];
  if (!e || e.type !== 'attack') return [];
  const out: { unitId: string; hp: number | null }[] = [];
  for (const unitId of [e.attackerId, e.targetId]) {
    let hp: number | null = null;
    for (let j = index + 1; j < events.length; j++) {
      const next = preHpOf(events[j]!, unitId);
      if (next !== undefined) {
        hp = next;
        break;
      }
    }
    out.push({ unitId, hp });
  }
  return out;
}
