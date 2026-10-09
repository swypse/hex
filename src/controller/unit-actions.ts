import { type BuilderBuildKind } from '@/game/economy/buildings';
import { type Command, Simulator } from '@/game/simulator';
import { stormEligible } from '@/game/units/storm';
import { canDisband, type Unit } from '@/game/units/units';
import { sfx } from '@/sound/sfx';
import { useGameStore } from '@/store/game-store';
import { BuildingKind, CommandType, OverlayKind, SelectionKind, SkillId, UnitType } from '@enums';
import { tileAt } from '@/game/map/tile-index';

export interface UnitActionsHost {
  readonly sim: Simulator | null;
  sendCommand(cmd: Command): void;
  render(): void;
}

/** Handlers for the selected unit / village / tile actions and the dialogs that confirm them. */
export class UnitActions {
  /** Tiles the pending builder placement or trap may target. */
  placementKeys = new Set<string>();
  pendingPlacement: { unitId: string; kind: BuilderBuildKind } | null = null;
  pendingTrap: { unitId: string } | null = null;
  pendingExtinguish: { unitId: string } | null = null;

  constructor(private readonly host: UnitActionsHost) {}

  private get sim(): Simulator | null {
    return this.host.sim;
  }

  private sendCommand(cmd: Command): void {
    this.host.sendCommand(cmd);
  }

  private render(): void {
    this.host.render();
  }

  upgradeSelectedVillage(): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection) return;
    this.sendCommand({ type: CommandType.UPGRADE_VILLAGE, q: selection.q, r: selection.r });
  }

  upgradeSelectedVillageFromToolbar(): void {
    this.upgradeSelectedVillage();
  }

  spawnSelectedVillage(type: UnitType): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection) return;
    this.sendCommand({ type: CommandType.SPAWN, q: selection.q, r: selection.r, unitType: type });
    store.setOverlay(null);
  }

  healSelectedUnit(): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection || !this.sim) return;
    const unit = tileAt(this.sim.map, selection.q, selection.r)?.unit;
    if (!unit || unit.owner !== store.localPlayerIndex) return;
    this.sendCommand({ type: CommandType.HEAL, unitId: unit.id });
    store.setSelection(null);
  }

  disbandSelectedUnit(): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection || selection.kind !== SelectionKind.UNIT || !this.sim) return;
    const tile = tileAt(this.sim.map, selection.q, selection.r);
    const unit = tile?.unit;
    if (!unit || unit.owner !== store.localPlayerIndex) return;
    if (!canDisband(unit)) return;
    store.setOverlay({ kind: OverlayKind.DISBAND, unitId: unit.id });
  }

  confirmDisband(): void {
    const store = useGameStore.getState();
    const pending = store.overlay?.kind === OverlayKind.DISBAND ? store.overlay.unitId : null;
    store.setOverlay(null);
    if (!pending || !this.sim) return;
    const unit = this.sim.map.tiles.find((t) => t.unit?.id === pending)?.unit;
    if (!unit || !canDisband(unit)) return;
    this.sendCommand({ type: CommandType.DISBAND, unitId: pending });
    store.setSelection(null);
  }

  cancelDisband(): void {
    useGameStore.getState().setOverlay(null);
  }

  enableStealthSelected(): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection || !this.sim) return;
    const unit = tileAt(this.sim.map, selection.q, selection.r)?.unit;
    if (!unit || unit.owner !== store.localPlayerIndex) return;
    this.sendCommand({ type: CommandType.ENABLE_STEALTH, unitId: unit.id });
    store.setSelection(null);
  }

  /** Builder: enter placement mode for `kind` once the kind was picked in the
   *  building popup. Highlighted cells are tapped to build. */
  beginBuilderPlacement(kind: BuilderBuildKind): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection || !this.sim) return;
    const unit = tileAt(this.sim.map, selection.q, selection.r)?.unit;
    if (!unit || unit.owner !== store.localPlayerIndex || unit.type !== UnitType.BUILDER) return;
    this.pendingPlacement = { unitId: unit.id, kind };
    this.pendingTrap = null;
    this.pendingExtinguish = null;
    store.setOverlay(null);
    this.render();
  }

  buildAsBuilder(kind: BuilderBuildKind, q: number, r: number): void {
    const pending = this.pendingPlacement;
    this.pendingPlacement = null;
    this.placementKeys.clear();
    if (!pending || !this.sim) return;
    this.sendCommand({ type: CommandType.BUILD, unitId: pending.unitId, q, r, kind });
  }

  cancelPlacement(): void {
    this.pendingPlacement = null;
    this.pendingTrap = null;
    this.pendingExtinguish = null;
    this.placementKeys.clear();
    useGameStore.getState().setSelection(null);
    this.render();
  }

  /** Trapper: enter trap placement mode. */
  placeTrap(): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection || !this.sim) return;
    const unit = tileAt(this.sim.map, selection.q, selection.r)?.unit;
    if (!unit || unit.owner !== store.localPlayerIndex || unit.type !== UnitType.TRAPPER) return;
    this.pendingTrap = { unitId: unit.id };
    this.pendingPlacement = null;
    this.pendingExtinguish = null;
    this.render();
  }

  /** Enter fire-extinguish mode: the burning tiles in reach are highlighted. */
  beginExtinguish(): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection || !this.sim) return;
    const unit = tileAt(this.sim.map, selection.q, selection.r)?.unit;
    if (!unit || unit.owner !== store.localPlayerIndex) return;
    this.pendingExtinguish = { unitId: unit.id };
    this.pendingPlacement = null;
    this.pendingTrap = null;
    this.render();
  }

  extinguishOn(q: number, r: number): void {
    const pending = this.pendingExtinguish;
    this.pendingExtinguish = null;
    this.placementKeys.clear();
    if (!pending || !this.sim) return;
    this.sendCommand({ type: CommandType.EXTINGUISH, unitId: pending.unitId, q, r });
  }

  placeTrapOn(q: number, r: number): void {
    const pending = this.pendingTrap;
    this.pendingTrap = null;
    this.placementKeys.clear();
    if (!pending || !this.sim) return;
    this.sendCommand({ type: CommandType.TRAP, unitId: pending.unitId, q, r });
  }

  stormSelected(): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection || !this.sim) return;
    const unit = tileAt(this.sim.map, selection.q, selection.r)?.unit;
    if (!unit || unit.owner !== store.localPlayerIndex || !stormEligible(this.sim.map, unit)) return;
    this.sendCommand({ type: CommandType.STORM, unitId: unit.id });
    store.setSelection(null);
  }

  /** Closes the open target dialog of `kind` and returns its target with the
   *  selected unit; null when the dialog is not open or no unit is selected. */
  private takeDialogTarget(kind: OverlayKind.STUN_CHOICE | OverlayKind.BONUS_LEAVE | OverlayKind.SHIP_LANDING | OverlayKind.STALKER_REVEAL | OverlayKind.MOVE_ATTACK): { target: { q: number; r: number }; unit: Unit } | null {
    const store = useGameStore.getState();
    const pending = store.overlay?.kind === kind ? store.overlay.target : null;
    store.setOverlay(null);
    if (!pending) return null;
    const selection = store.selection;
    if (!selection || selection.kind !== SelectionKind.UNIT || !this.sim) return null;
    const unit = tileAt(this.sim.map, selection.q, selection.r)?.unit;
    return unit ? { target: pending, unit } : null;
  }

  chooseStunFromDialog(): void {
    this.attackFromStunDialog(CommandType.STUN);
  }

  chooseRegularAttackFromStunDialog(): void {
    this.attackFromStunDialog(CommandType.ATTACK);
  }

  /** Closes the stun-choice dialog and sends `type` from the selected unit at the pending target. */
  private attackFromStunDialog(type: CommandType.STUN | CommandType.ATTACK): void {
    const hit = this.takeDialogTarget(OverlayKind.STUN_CHOICE);
    if (!hit) return;
    const { target: pending, unit } = hit;
    const store = useGameStore.getState();
    store.setSelection(null);
    this.sendCommand({ type, unitId: unit.id, q: pending.q, r: pending.r });
  }

  cancelStun(): void {
    useGameStore.getState().setOverlay(null);
  }

  buildSelectedBuilding(kind: BuildingKind): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection) return;
    this.sendCommand({ type: CommandType.BUILD, q: selection.q, r: selection.r, kind });
  }

  /** The selected unit burns the enemy farm/granary it stands on. */
  burnSelected(): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection || selection.kind !== SelectionKind.UNIT || !this.sim) return;
    const unit = tileAt(this.sim.map, selection.q, selection.r)?.unit;
    if (!unit) return;
    this.sendCommand({ type: CommandType.BURN, unitId: unit.id });
  }

  /** The selected unit destroys the enemy road it stands on. */
  burnRoadSelected(): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection || selection.kind !== SelectionKind.UNIT || !this.sim) return;
    const unit = tileAt(this.sim.map, selection.q, selection.r)?.unit;
    if (!unit) return;
    this.sendCommand({ type: CommandType.BURN_ROAD, unitId: unit.id });
  }

  repairSelectedBuilding(): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection) return;
    this.sendCommand({ type: CommandType.REPAIR, q: selection.q, r: selection.r });
  }

  destroySelectedBuilding(): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection) return;
    this.sendCommand({ type: CommandType.DESTROY_BUILDING, q: selection.q, r: selection.r });
  }

  buildSelectedWall(): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection) return;
    this.sendCommand({ type: CommandType.BUILD_WALL, q: selection.q, r: selection.r });
  }

  buildSelectedRoad(): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection) return;
    this.sendCommand({ type: CommandType.BUILD_ROAD, q: selection.q, r: selection.r });
  }

  buildSelectedBridge(): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection) return;
    this.sendCommand({ type: CommandType.BUILD_BRIDGE, q: selection.q, r: selection.r });
  }

  openSkill(id: SkillId): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    this.sendCommand({ type: CommandType.OPEN_SKILL, skill: id });
  }

  upgradeSelectedShip(): void {
    const store = useGameStore.getState();
    if (store.aiActive || store.gameOver) return;
    const selection = store.selection;
    if (!selection || !this.sim) return;
    const unit = tileAt(this.sim.map, selection.q, selection.r)?.unit;
    if (!unit || unit.shipLevel === undefined) return;
    this.sendCommand({ type: CommandType.UPGRADE_SHIP, unitId: unit.id });
  }

  dealWithSelectedPirate(): void {
    const store = useGameStore.getState();
    if (store.aiActive || store.gameOver) return;
    const selection = store.selection;
    if (!selection || selection.kind !== SelectionKind.UNIT || !this.sim) return;
    const unit = tileAt(this.sim.map, selection.q, selection.r)?.unit;
    if (!unit || unit.type !== UnitType.PIRATE) return;
    store.setSelection(null);
    this.sendCommand({ type: CommandType.DEAL, unitId: unit.id });
  }

  confirmShipLanding(): void {
    const hit = this.takeDialogTarget(OverlayKind.SHIP_LANDING);
    if (!hit) return;
    const { target: pending, unit } = hit;
    const store = useGameStore.getState();
    this.sendCommand({ type: CommandType.SHIP_LANDING, unitId: unit.id, q: pending.q, r: pending.r });
    store.setSelection(null);
  }

  cancelShipLanding(): void {
    useGameStore.getState().setOverlay(null);
  }

  confirmStalkerApproach(): void {
    const hit = this.takeDialogTarget(OverlayKind.STALKER_REVEAL);
    if (!hit) return;
    const { target: pending, unit } = hit;
    const store = useGameStore.getState();
    this.sendCommand({ type: CommandType.MOVE, unitId: unit.id, q: pending.q, r: pending.r });
    store.setSelection({ kind: SelectionKind.UNIT, q: pending.q, r: pending.r });
    sfx.play('click');
  }

  cancelStalkerApproach(): void {
    useGameStore.getState().setOverlay(null);
  }

  chooseMoveFromDialog(): void {
    const hit = this.takeDialogTarget(OverlayKind.MOVE_ATTACK);
    if (!hit) return;
    const { target: pending, unit } = hit;
    const store = useGameStore.getState();
    this.sendCommand({ type: CommandType.MOVE, unitId: unit.id, q: pending.q, r: pending.r });
    store.setSelection({ kind: SelectionKind.UNIT, q: pending.q, r: pending.r });
    sfx.play('click');
  }

  chooseAttackFromDialog(): void {
    const hit = this.takeDialogTarget(OverlayKind.MOVE_ATTACK);
    if (!hit) return;
    const { target: pending, unit } = hit;
    const store = useGameStore.getState();
    store.setSelection(null);
    this.sendCommand({ type: CommandType.ATTACK, unitId: unit.id, q: pending.q, r: pending.r });
  }

  /** Bonus dialog: go ahead with the move and give the bonus up. */
  chooseLeaveBonus(): void {
    const hit = this.takeDialogTarget(OverlayKind.BONUS_LEAVE);
    if (!hit) return;
    this.sendCommand({ type: CommandType.MOVE, unitId: hit.unit.id, q: hit.target.q, r: hit.target.r });
    useGameStore.getState().setSelection({ kind: SelectionKind.UNIT, q: hit.target.q, r: hit.target.r });
    sfx.play('click');
  }

  /** Bonus dialog: stay put and claim the bonus instead. */
  claimBonusFromDialog(): void {
    if (!this.takeDialogTarget(OverlayKind.BONUS_LEAVE)) return;
    this.sendCommand({ type: CommandType.CLAIM_BONUS });
  }

  cancelBonusLeave(): void {
    useGameStore.getState().setOverlay(null);
  }

  cancelMoveAttack(): void {
    useGameStore.getState().setOverlay(null);
  }
}
