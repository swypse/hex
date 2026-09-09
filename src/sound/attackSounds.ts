import type { UnitType } from '../game/units';

export interface AttackSoundPlan {
  launch?: 'arcShot';
  impact?: 'swordHit' | 'hit';
}

export function attackSound(attackerType: UnitType | undefined, missed: boolean, ship = false): AttackSoundPlan {
  if (ship) return missed ? {} : { impact: 'hit' };
  if (attackerType === 'archer') {
    return missed ? { launch: 'arcShot' } : { launch: 'arcShot', impact: 'hit' };
  }
  if (missed) return {};
  if (attackerType === 'swordsman' || attackerType === 'knight') return { impact: 'swordHit' };
  return { impact: 'hit' };
}
