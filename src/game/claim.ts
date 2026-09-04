import { MapTile } from './mapGen';

export function claimTileForVillage(target: MapTile, claimingVillage: MapTile): void {
  const claimed = target.claimedByVillage;
  if (claimed === null) {
    target.claimedByVillage = { q: claimingVillage.q, r: claimingVillage.r };
    if (claimingVillage.settlement && claimingVillage.settlement.owner !== null) {
      target.ownedBy = claimingVillage.settlement.owner;
    }
    return;
  }

  const targetIsFreeVillageTile =
    claimed.q === target.q && claimed.r === target.r && target.ownedBy === null;
  if (targetIsFreeVillageTile) return;

  const claimingSettlement = claimingVillage.settlement;
  if (!claimingSettlement || claimingSettlement.owner === null) return;
  if (target.ownedBy === null) {
    target.ownedBy = claimingSettlement.owner;
    target.claimedByVillage = { q: claimingVillage.q, r: claimingVillage.r };
  }
}
