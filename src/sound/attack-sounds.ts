import { AttackImpact, UnitType } from '@enums';

interface AttackSoundPlan {
  launch?: 'arcShot';
  impact?: AttackImpact;
}

export function attackSound(attackerType: UnitType | undefined, missed: boolean, ship = false): AttackSoundPlan {
  if (ship) return missed ? {} : { impact: AttackImpact.HIT };
  if (attackerType === UnitType.ARCHER) {
    return missed ? { launch: 'arcShot' } : { launch: 'arcShot', impact: AttackImpact.HIT };
  }
  if (missed) return {};
  if (attackerType === UnitType.SWORDSMAN || attackerType === UnitType.KNIGHT) return { impact: AttackImpact.SWORD_HIT };
  return { impact: AttackImpact.HIT };
}
