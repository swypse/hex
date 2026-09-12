import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { Simulator } from '../game/simulator';
import { AttackUnitPre, GameEvent } from '../game/events';
import { MapTile } from '../game/mapGen';
import { Player } from '../game/players';
import { TRIBES } from '../game/tribes';
import { canAttack, canMove, HEAL_AMOUNT, PIRATE_OWNER, Unit, UNIT_TYPES } from '../game/units';
import { isWaterType } from '../game/tileTypes';
import { tileAt } from '../game/selection';
import { isExploredFor } from '../game/explore';
import { axialKey, hexDistance, hexToPixel, type Axial } from '../game/hex';
import { tileElevation } from '../render/elevation';
import { MapView } from '../render/mapRenderer';
import { spawnShipWake } from '../render/wake';
import { TextureSet } from '../render/textureFactory';
import { useGameStore } from '../store/gameStore';
import { EXPLORED_SCORE } from '../game/score';
import { makeLabel } from '../ui/kit/label';
import { saveRepository } from '../storage/saveGame';
import { BonusKind } from '../game/bonus';
import { SKILLS } from '../game/skills';
import { achievementIcon, achievementNameKey } from '../game/achievements';
import { CameraController } from './cameraController';
import { initialAttackHpOverrides, hpOverrideAfterAttack } from './attackHp';
import { attackPresenceParticipants, type AttackPresenceParticipant } from './attackPresence';
import { t } from '../i18n';
import { sfx } from '../sound/sfx';
import { attackSound } from '../sound/attackSounds';

const HEX_SIZE = 40;


const DEATH_PARTICLE_COUNT = 10;
const DEATH_RISE = 200;
const DEATH_MS = 3000;
const DEATH_STAGGER_MS = 700;

const COMBAT_DEATH_GAP_MS = 350;
const COMBAT_ADVANCE_MS = 180;

/** Arrow projectile flight time for the archer attack animation (ms). */
const PROJECTILE_MS_PER_TILE = 150;

const ACH_CHIP_BG = 0x373748;
const ACH_CHIP_SIZE = 64;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Explorer path cells that should stay under fog until the scout arrives —
 *  only cells the player had not explored before the bonus. Cells that were
 *  already explored must remain visible; deferring (and re-revealing) them
 *  would fog them a second time. */
export function deferredExplorerKeys(
  pathTiles: { q: number; r: number }[],
  preExplored: Set<string>,
): Set<string> {
  const defer = new Set<string>();
  for (const c of pathTiles) {
    const k = axialKey(c);
    if (!preExplored.has(k)) defer.add(k);
  }
  return defer;
}

export interface EventHost {
  app(): Application | null;
  mapRoot(): Container | null;
  mapView(): MapView | null;
  textures(): TextureSet | null;
  sim(): Simulator | null;
  hiddenUnitIds(): Set<string>;
  camera(): CameraController;
  render(): void;
  syncKnownTribes(notify: boolean): void;
  enqueue(task: () => Promise<void>): Promise<void>;
  bringCellIntoView(q: number, r: number): Promise<void>;
  exploredKeysFor(playerIndex: number): Set<string>;
  saveGame(): void;
}

export class EventPresenter {
  constructor(private readonly host: EventHost) {}

  /** Static sprites that keep enemy units visible at their starting hex until
   * their own move animation begins (they are otherwise hidden up front). */
  private moveGhosts: { unitId: string; sprite: Sprite }[] = [];

  private findUnitById(unitId: string): Unit | undefined {
    const sim = this.host.sim();
    if (!sim) return undefined;
    const tile = sim.map.tiles.find((t) => t.unit?.id === unitId);
    return tile?.unit ?? undefined;
  }

  private revealNewlyExplored(preExplored: Set<string>, skip?: Set<string>): void {
    const sim = this.host.sim();
    if (!sim) return;
    const store = useGameStore.getState();
    const post = this.host.exploredKeysFor(store.localPlayerIndex);
    const newly: { q: number; r: number }[] = [];
    for (const t of sim.map.tiles) {
      const k = axialKey(t);
      if (skip?.has(k)) continue;
      if (post.has(k) && !preExplored.has(k)) newly.push({ q: t.q, r: t.r });
    }
    const FOG_REVEAL_DELAY = 40;
    newly.forEach((c, i) => setTimeout(() => this.spawnFogRevealAt(c.q, c.r), i * FOG_REVEAL_DELAY));
  }

  private spawnFogRevealAt(q: number, r: number): void {
    const tile = this.host.sim()?.map.tiles.find((t) => t.q === q && t.r === r);
    if (tile) this.spawnFogReveal(tile);
  }

  /** Keep a player's own explorer path under fog until its scout reaches each
   * cell. Returns the path keys whose local exploration was deferred; callers
   * must restore them (see `restoreDeferredFog`). */
  private deferExplorerFog(events: GameEvent[], local: number, preExplored: Set<string>): Set<string> {
    const pathTiles: { q: number; r: number }[] = [];
    for (const e of events) {
      if (e.type !== 'explorer' || e.playerIndex !== local) continue;
      pathTiles.push({ q: e.q, r: e.r }, ...e.path);
    }
    const defer = deferredExplorerKeys(pathTiles, preExplored);
    this.setLocalExplored(defer, false);
    return defer;
  }

  private restoreDeferredFog(keys: Set<string>): void {
    this.setLocalExplored(keys, true);
  }

  private setLocalExplored(keys: Set<string>, explored: boolean): void {
    const sim = this.host.sim();
    if (!sim) return;
    const local = useGameStore.getState().localPlayerIndex;
    for (const k of keys) {
      const t = sim.map.tiles.find((x) => axialKey(x) === k);
      if (!t) continue;
      const arr = t.exploredBy ?? [];
      const has = arr.includes(local);
      if (explored && !has) {
        (t.exploredBy ??= []).push(local);
      } else if (!explored && has) {
        t.exploredBy = arr.filter((i) => i !== local);
      }
    }
  }

  async present(events: GameEvent[], preExplored: Set<string>): Promise<void> {
    const sim = this.host.sim();
    if (!this.host.app() || !sim) return;
    const local = useGameStore.getState().localPlayerIndex;
    const deferredFog = this.deferExplorerFog(events, local, preExplored);
    this.revealNewlyExplored(preExplored, deferredFog);
    // The sim state already reflects every move in this batch, so any render
    // draws each moved unit on its destination. Hide all units that will be
    // animated before the first render: otherwise a unit whose own walk has
    // not started yet is already visible on its destination while another
    // unit animates.
    const movedIds = new Set<string>();
    for (const e of events) {
      if (e.type === 'unitMoved') {
        movedIds.add(e.unitId);
        this.host.hiddenUnitIds().add(e.unitId);
      }
    }
    // Keep each enemy unit that is about to move visible on its starting hex
    // until its own animation starts (the hide-above would otherwise blank it
    // for the whole opening of the turn).
    this.moveGhosts = [];
    for (const e of events) {
      if (e.type !== 'unitMoved') continue;
      const unit = this.findUnitById(e.unitId);
      if (!unit || unit.owner === local) continue;
      const fromTile = tileAt(sim.map, e.from.q, e.from.r);
      if (!fromTile || !isExploredFor(fromTile, local)) continue;
      if (this.moveGhosts.some((g) => g.unitId === unit.id)) continue;
      const sprite = this.makeMoveGhostSprite(unit, fromTile);
      if (sprite) this.moveGhosts.push({ unitId: unit.id, sprite });
    }
    // Reveal units hidden up front whose move presentation was skipped (e.g.
    // an enemy move into unexplored territory). This must always run, even if a
    // single event presentation throws, or the moved units would stay hidden.
    // The sim map already holds every attack outcome of this batch, so keep the
    // hp of units that will be attacked showing their pre-batch value until
    // their own attack is presented; otherwise an earlier render (e.g. a move
    // into range) would show the damage before the attack animation.
    const initialHp = initialAttackHpOverrides(events);
    if (initialHp.size > 0) {
      const mapView = this.host.mapView();
      for (const [unitId, hp] of initialHp) mapView?.setHpOverride(unitId, hp);
    }
    const initialPresence = this.presenceOverrides(events, 0);
    if (initialPresence.size > 0) this.host.mapView()?.setUnitOverrides(initialPresence);
    let hadAttack = false;
    try {
      for (let i = 0; i < events.length; i++) {
        const e = events[i]!;
        switch (e.type) {
          case 'unitMoved':
            await this.presentUnitMoved(e);
            break;
          case 'attack':
            hadAttack = true;
            await this.presentAttack(e, this.presenceOverrides(events, i + 1));
            this.applyPostAttackHp(events, i);
            break;
          case 'spawned':
            if (e.playerIndex === local) sfx.play('spawn');
            break;
          case 'captured':
            this.presentCaptured(e);
            break;
          case 'villageUpgraded': {
            if (e.playerIndex === local) sfx.play('upgrade');
            const tile = tileAt(sim.map, e.q, e.r);
            if (tile && isExploredFor(tile, local)) {
              this.host.render();
              this.host.mapView()?.bounceHex(e.q, e.r);
            }
            break;
          }
          case 'built':
            break;
          case 'templeGrown':
            break;
          case 'skillOpened':
            if (e.playerIndex === local) sfx.play('claim');
            break;
          case 'healed': {
            const unit = this.findUnitById(e.unitId);
            if (unit) {
              const t = tileAt(sim.map, unit.q, unit.r);
              if (t) this.spawnHpText(t, `+${HEAL_AMOUNT}`, 0x44ff44);
            }
            break;
          }
          case 'shipUpgraded':
            break;
          case 'shipReverted':
            break;
          case 'scoreFly': {
            if (e.playerIndex !== useGameStore.getState().localPlayerIndex) break;
            const tile = tileAt(sim.map, e.q, e.r);
            if (tile) this.spawnScoreFly(tile, e.playerIndex, e.amount);
            break;
          }
          case 'knightCombo': {
            if (e.playerIndex === useGameStore.getState().localPlayerIndex) {
              useGameStore.getState().setCenterMessage('Combo kill!');
            }
            break;
          }
          case 'bonusClaimed':
            this.presentBonusClaimed(e);
            if (e.playerIndex === local) sfx.play('claim');
            break;
          case 'bottleCollected':
            this.presentBottleCollected(e);
            break;
          case 'explorer':
            await this.presentExplorer(e);
            break;
          case 'turnStarted':
            this.presentTurnStarted(e.playerIndex, e.turn);
            break;
          case 'aiTurn':
            useGameStore.getState().setCurrentPlayerIndex(e.playerIndex);
            break;
          case 'pirateSpawned':
            useGameStore.getState().setCenterMessage(t('msg.pirates'));
            break;
          case 'pirateCapture': {
            if (e.playerIndex === useGameStore.getState().localPlayerIndex) {
              useGameStore.getState().setCenterMessage(
                e.success ? t('msg.shipCaptured') : t('msg.shipCaptureFailed'),
              );
            }
            break;
          }
          case 'achievementUnlocked': {
            if (e.playerIndex === useGameStore.getState().localPlayerIndex) {
              useGameStore.getState().setCenterMessage(
                t('ach.unlocked', { name: t(achievementNameKey(e.achievement)) }),
                achievementIcon(e.achievement),
                { size: ACH_CHIP_SIZE, bgColor: ACH_CHIP_BG },
              );
            }
            break;
          }
          case 'gameOver':
            this.presentGameOver(e.winnerIndex, e.bonus);
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    } finally {
      this.restoreDeferredFog(deferredFog);
      this.clearMoveGhosts();
      this.host.syncKnownTribes(true);
      for (const id of movedIds) this.host.hiddenUnitIds().delete(id);
      if (hadAttack) this.host.mapView()?.clearHpOverrides();
    }
    if (movedIds.size > 0 || hadAttack) this.host.render();
  }

  /** After an attack is presented, drop the affected units' hp display to the
   *  value they should have until their next attack in this batch (their real
   *  post-battle hp when none follows). */
  private applyPostAttackHp(events: GameEvent[], index: number): void {
    const mapView = this.host.mapView();
    if (!mapView) return;
    for (const step of hpOverrideAfterAttack(events, index)) {
      mapView.setHpOverride(step.unitId, step.hp);
    }
    this.host.render();
  }

  private async presentAttack(
    e: Extract<GameEvent, { type: 'attack' }>,
    keep: Map<string, Unit>,
  ): Promise<void> {
    const sim = this.host.sim();
    if (!sim) return;
    const local = useGameStore.getState().localPlayerIndex;
    const attackerTile = tileAt(sim.map, e.attackerTile.q, e.attackerTile.r);
    const targetTile = tileAt(sim.map, e.targetTile.q, e.targetTile.r);
    const attackerVisible = attackerTile !== undefined && isExploredFor(attackerTile, local);
    const targetVisible = targetTile !== undefined && isExploredFor(targetTile, local);
    const mapView = this.host.mapView();

    // Follow enemy/pirate attacks that happen off-screen, the same way moves
    // center the camera on an off-screen enemy step.
    const attackerIsEnemyOrPirate = e.attackerIndex !== local;
    if (
      attackerIsEnemyOrPirate &&
      attackerVisible &&
      attackerTile !== undefined
    ) {
      await this.host.bringCellIntoView(attackerTile.q, attackerTile.r);
    }

    const audible = attackerVisible || targetVisible;
    const plan = attackSound(e.attackerPre?.type, e.missed, e.attackerPre?.shipLevel !== undefined);
    const impact = audible ? plan.impact : undefined;
    if (audible && plan.launch) sfx.play(plan.launch);

    // Land archers shoot a visible arrow projectile along an arc to the target.
    if (
      plan.launch === 'arcShot' &&
      attackerVisible &&
      attackerTile !== undefined &&
      targetTile !== undefined
    ) {
      this.spawnArrow(attackerTile, targetTile);
    }
    // Ships fire a cannonball projectile along the same trajectory.
    if (
      e.attackerPre?.shipLevel !== undefined &&
      attackerVisible &&
      attackerTile !== undefined &&
      targetTile !== undefined
    ) {
      this.spawnCannonball(attackerTile, targetTile);
    }
    // Catapults lob a cannonball projectile on a higher arc at their ranged target.
    if (
      e.attackerPre?.type === 'catapult' &&
      attackerVisible &&
      attackerTile !== undefined &&
      targetTile !== undefined
    ) {
      this.spawnCatapultBall(attackerTile, targetTile);
    }

    // In the final sim state a melee attacker that killed its target already
    // stands on the target tile; detect that so we can animate the advance.
    const attackerAdvanced =
      e.targetDied &&
      attackerTile !== undefined &&
      targetTile !== undefined &&
      targetTile.unit?.id === e.attackerId;

    // Face the attacker toward its target: flip left when the target is on the
    // left, otherwise keep the default right-facing sprite.
    let facing: 'left' | 'right' = 'right';
    if (attackerTile && targetTile) {
      const ax = hexToPixel(e.attackerTile, HEX_SIZE).x;
      const tx = hexToPixel(e.targetTile, HEX_SIZE).x;
      facing = tx < ax ? 'left' : 'right';
      mapView?.setUnitFacing(e.attackerId, facing);
    }

    if (mapView && !e.missed && attackerTile && targetTile && attackerVisible && e.attackerPre && e.targetPre) {
      try {
        await this.presentStagedAttack(e, attackerTile, targetTile, targetVisible, attackerAdvanced, facing, impact, keep);
      } finally {
        mapView.setUnitOverrides(keep);
        this.host.render();
      }
    } else {
      if (mapView && !e.missed) {
        const attacker = attackerTile?.unit;
        const target = targetTile?.unit;
        if (attacker) mapView.setHpOverride(attacker.id, attacker.hp + e.targetDamage);
        if (target) mapView.setHpOverride(target.id, target.hp + e.attackerDamage);
        this.host.render();
      }
      if (attackerTile && targetTile && attackerVisible) {
        const scale = this.host.camera().scale;
        await this.host.mapView()?.lungeUnit(axialKey(attackerTile), axialKey(targetTile), 10 / scale);
      }
      if (mapView) {
        mapView.clearHpOverrides();
        this.host.render();
      }
      if (!e.missed && impact) sfx.play(impact);
      if (e.missed) {
        if (targetTile && attackerVisible) this.spawnHpText(targetTile, 'Miss', 0xffa500);
      } else {
        if (e.attackerDamage > 0 && targetTile && attackerVisible) this.spawnHpText(targetTile, `-${e.attackerDamage}`, 0xff4444);
        if (e.targetDamage > 0 && attackerTile && targetVisible) this.spawnHpText(attackerTile, `-${e.targetDamage}`, 0xff4444);
      }
      if (e.targetDied && targetTile && targetVisible) this.spawnDeath(targetTile);
      if (e.attackerDied && attackerTile && attackerVisible) this.spawnDeath(attackerTile);
      if (mapView) {
        mapView.setUnitOverrides(keep);
        this.host.render();
      }
    }
    this.keepAttackerSelected(e);
  }

  private presenceOverrides(events: GameEvent[], fromIndex: number): Map<string, Unit> {
    const sim = this.host.sim();
    const out = new Map<string, Unit>();
    if (!sim) return out;
    const local = useGameStore.getState().localPlayerIndex;
    const hidden = this.host.hiddenUnitIds();
    for (const p of attackPresenceParticipants(events.slice(fromIndex)).values()) {
      const tile = tileAt(sim.map, p.tile.q, p.tile.r);
      if (!tile || !isExploredFor(tile, local)) continue;
      if (hidden.has(p.unitId)) continue;
      const key = axialKey(p.tile);
      if (out.has(key)) continue;
      out.set(key, this.stagedPresenceUnit(p));
    }
    return out;
  }

  private stagedPresenceUnit(p: AttackPresenceParticipant): Unit {
    const info = UNIT_TYPES[p.pre.type];
    return {
      id: p.unitId,
      owner: p.pre.owner,
      type: p.pre.type,
      q: p.tile.q,
      r: p.tile.r,
      hasMoved: false,
      hasAttacked: false,
      hasHealed: false,
      hp: p.pre.hp,
      attack: info.attack,
      attackDistance: info.attackDistance,
      spawnVillage: null,
      shipLevel: p.pre.shipLevel,
    };
  }

  /** Keep a local unit highlighted after an attack when it may still act:
   * a rider that attacked can spend its post-attack move, and a knight that
   * killed can attack again. Ships never move/attack again after attacking. */
  private keepAttackerSelected(e: Extract<GameEvent, { type: 'attack' }>): void {
    const store = useGameStore.getState();
    if (e.attackerIndex !== store.localPlayerIndex || e.missed || e.attackerDied) return;
    const sim = this.host.sim();
    if (!sim) return;
    const attacker = this.findUnitById(e.attackerId);
    if (!attacker || attacker.shipLevel !== undefined) return;
    if (attacker.type === 'rider' && canMove(attacker)) {
      store.setSelection({ kind: 'unit', q: attacker.q, r: attacker.r });
      return;
    }
    if (attacker.type === 'knight' && canAttack(attacker)) {
      store.setSelection({ kind: 'unit', q: attacker.q, r: attacker.r });
    }
  }

  /** Combat presentation that stages the pre-attack positions/hp so the killed
   * unit stays visible through the attack and hp-number animation, then dies,
   * and a melee attacker visibly moves onto the killed unit's tile.
   *
   * Order: attacker lunge → target -hp → target counter-lunge → attacker -hp →
   * death burst (unit fades out) → attacker walks onto the vacated tile.
   */
  private async presentStagedAttack(
    e: Extract<GameEvent, { type: 'attack' }>,
    attackerTile: MapTile,
    targetTile: MapTile,
    targetVisible: boolean,
    attackerAdvanced: boolean,
    facing: 'left' | 'right',
    impact?: 'swordHit' | 'hit',
    keep: Map<string, Unit> = new Map(),
  ): Promise<void> {
    const mapView = this.host.mapView();
    if (!mapView) return;
    const local = useGameStore.getState().localPlayerIndex;
    const attackerKey = axialKey(attackerTile);
    const targetKey = axialKey(targetTile);
    const attacker = this.stageUnit(e.attackerPre!, e.attackerId, attackerTile.q, attackerTile.r);
    const target = this.stageUnit(e.targetPre!, e.targetId, targetTile.q, targetTile.r);
    const staged = new Map<string, Unit | null>(keep);
    staged.set(attackerKey, attacker);
    staged.set(targetKey, target);
    mapView.setUnitOverrides(staged);
    this.host.render();
    mapView.faceUnitAtKey(attackerKey, facing);

    const scale = this.host.camera().scale;
    await mapView.lungeUnit(attackerKey, targetKey, 10 / scale);
    if (impact) sfx.play(impact);

    // Attacker's blow lands on the target first.
    if (e.attackerDamage > 0) {
      this.spawnHpText(targetTile, `-${e.attackerDamage}`, 0xff4444);
      target.hp = Math.max(0, target.hp - e.attackerDamage);
      this.host.render();
    }

    // Then the target answers with its own attack animation when it deals
    // counter damage (sim: the target counters when it survives). Ranged
    // defenders (archers, ships, catapults) fire their own projectile back
    // once the initial attack animation has finished.
    if (e.targetDamage > 0) {
      const counterFacing: 'left' | 'right' = facing === 'left' ? 'right' : 'left';
      mapView.faceUnitAtKey(targetKey, counterFacing);
      const targetPre = e.targetPre!;
      if (targetPre.type === 'archer' && targetPre.shipLevel === undefined) {
        await this.spawnArrowFromTo(targetTile, attackerTile);
      } else if (targetPre.shipLevel !== undefined || targetPre.type === 'catapult') {
        await this.spawnCannonballFromTo(targetTile, attackerTile, targetPre.type === 'catapult');
      } else {
        await mapView.lungeUnit(targetKey, attackerKey, 10 / scale);
      }
      this.spawnHpText(attackerTile, `-${e.targetDamage}`, 0xff4444);
      attacker.hp = Math.max(0, attacker.hp - e.targetDamage);
      this.host.render();
    }

    const attackerVisible = isExploredFor(attackerTile, local);
    if (e.targetDied && targetVisible) {
      this.spawnDeath(targetTile);
      await sleep(COMBAT_DEATH_GAP_MS);
    }
    if (e.attackerDied && attackerVisible) {
      this.spawnDeath(attackerTile);
      await sleep(COMBAT_DEATH_GAP_MS);
    }
    if (e.attackerDied) staged.delete(attackerKey);
    if (e.targetDied) {
      if (attackerAdvanced && !e.attackerDied) staged.set(targetKey, null);
      else staged.delete(targetKey);
    }
    if (attackerAdvanced && !e.attackerDied) {
      mapView.setUnitOverrides(staged);
      this.host.render();
      await mapView.slideUnit(attackerKey, targetKey, COMBAT_ADVANCE_MS);
    }
  }

  private stageUnit(pre: AttackUnitPre, refId: string, q: number, r: number): Unit {
    const info = UNIT_TYPES[pre.type];
    return {
      id: `stage:${refId}`,
      owner: pre.owner,
      type: pre.type,
      q,
      r,
      hasMoved: false,
      hasAttacked: false,
      hasHealed: false,
      hp: pre.hp,
      attack: info.attack,
      attackDistance: info.attackDistance,
      spawnVillage: null,
      shipLevel: pre.shipLevel,
    };
  }

  private async presentUnitMoved(e: Extract<GameEvent, { type: 'unitMoved' }>): Promise<void> {
    const sim = this.host.sim();
    if (!this.host.app() || !sim) return;
    const unit = this.findUnitById(e.unitId);
    if (!unit) return;
    const local = useGameStore.getState().localPlayerIndex;
    const isPirate = unit.owner === PIRATE_OWNER;
    if (isPirate) {
      const from = tileAt(sim.map, e.from.q, e.from.r);
      if (!from || !isExploredFor(from, local)) return;
    } else if (unit.owner !== local) {
      const dest = tileAt(sim.map, e.to.q, e.to.r);
      if (!dest || !isExploredFor(dest, local)) return;
      await this.host.bringCellIntoView(e.to.q, e.to.r);
    }
    await this.animateMoveEvent(unit, e);
  }

    private makeMoveGhostSprite(unit: Unit, tile: MapTile): Sprite | null {
    const mapView = this.host.mapView();
    const textures = this.host.textures();
    if (!mapView || !textures || !this.host.app()) return null;
    const store = useGameStore.getState();
    const tribe = unit.owner >= 0 ? store.players[unit.owner]?.tribe : undefined;
    const unitTex =
      unit.type === 'pirate'
        ? textures.pirateTexture
        : unit.shipLevel !== undefined && tribe !== undefined
          ? textures.shipTextures[tribe]?.[unit.shipLevel]
          : tribe !== undefined
            ? textures.unitTextures[tribe]?.[unit.type]
            : undefined;
    if (!unitTex) return null;
    const sprite = new Sprite(unitTex.texture);
    sprite.anchor.set(0.5, unitTex.anchorY);
    sprite.scale.set(this.host.camera().spriteScale);
    sprite.zIndex = 9;
    const p = hexToPixel(tile, HEX_SIZE);
    sprite.position.set(p.x, p.y - tileElevation(tile, HEX_SIZE));
    mapView.container.addChild(sprite);
    return sprite;
  }

  private removeMoveGhost(unitId: string): void {
    const idx = this.moveGhosts.findIndex((g) => g.unitId === unitId);
    if (idx === -1) return;
    const ghost = this.moveGhosts[idx]!;
    this.moveGhosts.splice(idx, 1);
    const mapView = this.host.mapView();
    if (mapView) mapView.container.removeChild(ghost.sprite);
    ghost.sprite.destroy();
  }

  private clearMoveGhosts(): void {
    for (const ghost of this.moveGhosts) {
      const mapView = this.host.mapView();
      if (mapView) mapView.container.removeChild(ghost.sprite);
      ghost.sprite.destroy();
    }
    this.moveGhosts = [];
  }

  private async animateMoveEvent(
    unit: Unit,
    e: Extract<GameEvent, { type: 'unitMoved' }>,
  ): Promise<void> {
    const sim = this.host.sim();
    const mapView = this.host.mapView();
    const textures = this.host.textures();
    if (!this.host.app() || !sim || !mapView || !textures) return;
    const dest = tileAt(sim.map, e.to.q, e.to.r);
    if (!dest) return;
    const local = useGameStore.getState().localPlayerIndex;
    const map = sim.map;
    let steps = e.path;
    if (unit.owner !== local && unit.owner !== PIRATE_OWNER) {
      steps = steps.filter((s) => {
        const t = tileAt(map, s.q, s.r);
        return t !== undefined && isExploredFor(t, local);
      });
      if (steps.length === 0) return;
    }
    const store = useGameStore.getState();
    const tribe = store.players[unit.owner]?.tribe;
    const unitTex = unit.type === 'pirate'
      ? { texture: textures.pirateTexture.texture, anchorY: textures.pirateTexture.anchorY }
      : e.shipLevel !== undefined && tribe !== undefined
        ? textures.shipTextures[tribe]?.[e.shipLevel]
        : tribe !== undefined
          ? textures.unitTextures[tribe]?.[unit.type]
          : undefined;
    if (!unitTex) return;
    const texture = unitTex.texture;
    const startTile = tileAt(map, e.from.q, e.from.r);
    const startVisible = unit.owner === local || (startTile !== undefined && isExploredFor(startTile, local));
    if (startVisible && e.shipLevel !== undefined) sfx.play('waterSplash');
    this.removeMoveGhost(unit.id);
    this.host.hiddenUnitIds().add(unit.id);
    this.host.render();
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5, unitTex.anchorY);
    sprite.scale.set(this.host.camera().spriteScale);
    sprite.zIndex = 10;
    const startPos = hexToPixel(e.from, HEX_SIZE);
    const fromTile = tileAt(map, e.from.q, e.from.r);
    sprite.position.set(startPos.x, startPos.y - (fromTile ? tileElevation(fromTile, HEX_SIZE) : 0));
    mapView.container.addChild(sprite);
    const seaUnit = e.shipLevel !== undefined || unit.type === 'pirate';
    let prev = e.from;
    for (const step of steps) {
      const to = hexToPixel(step, HEX_SIZE);
      const targetTile = tileAt(map, step.q, step.r);
      const y = targetTile ? to.y - tileElevation(targetTile, HEX_SIZE) : to.y;
      await this.tweenSpriteTo(sprite, { x: to.x, y }, 110);
      if (seaUnit) this.spawnShipWakeSegment(prev, step);
      prev = step;
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    this.host.hiddenUnitIds().delete(unit.id);
    mapView.container.removeChild(sprite);
    sprite.destroy();
    this.host.render();
    const boarded = e.shipLevel === undefined && unit.shipLevel !== undefined;
    if (boarded) {
      const destVisible = unit.owner === local || isExploredFor(dest, local);
      if (destVisible) sfx.play('waterSquish');
    }
  }

  /** Scatters a short fading wake along the segment between two adjacent water
   *  tiles the sea unit just sailed across. No-op for land steps (the landing
   *  stop) and non-adjacent pairs (unexplored gaps in enemy paths). */
  private spawnShipWakeSegment(from: Axial, to: Axial): void {
    const app = this.host.app();
    const mapView = this.host.mapView();
    const sim = this.host.sim();
    if (!app || !mapView || !sim) return;
    const fromTile = tileAt(sim.map, from.q, from.r);
    const toTile = tileAt(sim.map, to.q, to.r);
    if (!fromTile || !toTile) return;
    if (hexDistance(from, to) !== 1) return;
    if (!isWaterType(fromTile.terrain) || !isWaterType(toTile.terrain)) return;
    spawnShipWake(app, mapView.container, hexToPixel(from, HEX_SIZE), hexToPixel(to, HEX_SIZE));
  }

  private presentBonusClaimed(e: Extract<GameEvent, { type: 'bonusClaimed' }>): void {
    const store = useGameStore.getState();
    const local = store.localPlayerIndex;
    const sim = this.host.sim();
    const mapView = this.host.mapView();
    if (sim && mapView) {
      const tile = tileAt(sim.map, e.q, e.r);
      if (tile && isExploredFor(tile, local)) {
        const p = hexToPixel({ q: e.q, r: e.r }, HEX_SIZE);
        mapView.spawnBonusClaim(p.x, p.y - tileElevation(tile, HEX_SIZE));
      }
    }
    if (e.playerIndex !== local) return;
    if (e.kind === 'skill') {
      if (e.skill) store.setCenterMessage(t('msg.skillOpened', { skill: SKILLS[e.skill].name }));
      return;
    }
    const messages: Record<Exclude<BonusKind, 'skill'>, string> = {
      money: '+15 money',
      resources: '+10 wood, +5 stone, +5 ore',
      villageUpgrade: 'Village upgraded for free',
      explorer: 'An explorer is scouting the land',
    };
    store.setCenterMessage(`Bonus: ${messages[e.kind]}`);
  }

  private presentBottleCollected(e: Extract<GameEvent, { type: 'bottleCollected' }>): void {
    if (e.playerIndex !== useGameStore.getState().localPlayerIndex) return;
    const messages = {
      money: t('msg.bottleMoney'),
      skill: e.skill ? t('msg.bottleSkill', { skill: SKILLS[e.skill].name }) : t('msg.bottleMoney'),
      heal: t('msg.bottleHeal'),
    };
    useGameStore.getState().setCenterMessage(messages[e.kind], 'bottle.png');
  }

  private async presentExplorer(e: Extract<GameEvent, { type: 'explorer' }>): Promise<void> {
    // Only the player who claimed the explorer bonus sees its scout; other
    // players must not glimpse it crossing their explored cells.
    if (e.playerIndex !== useGameStore.getState().localPlayerIndex) return;
    const sim = this.host.sim();
    const mapView = this.host.mapView();
    const textures = this.host.textures();
    if (!sim || !mapView || !textures || !this.host.app()) return;
    const player = sim.players[e.playerIndex];
    const startTile = tileAt(sim.map, e.q, e.r);
    if (!player || !startTile) return;
    const unitTex = textures.unitTextures[player.tribe]?.['warrior'];
    if (!unitTex) return;
    const sprite = new Sprite(unitTex.texture);
    sprite.anchor.set(0.5, unitTex.anchorY);
    sprite.scale.set(this.host.camera().spriteScale);
    sprite.alpha = 0.5;
    sprite.zIndex = 10;
    const startPos = hexToPixel(e, HEX_SIZE);
    sprite.position.set(startPos.x, startPos.y - tileElevation(startTile, HEX_SIZE));
    mapView.container.addChild(sprite);
    this.revealExplorerTile(startTile);
    for (const step of e.path) {
      const to = hexToPixel(step, HEX_SIZE);
      const targetTile = tileAt(sim.map, step.q, step.r);
      const y = targetTile ? to.y - tileElevation(targetTile, HEX_SIZE) : to.y;
      await this.tweenSpriteTo(sprite, { x: to.x, y }, 100);
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (targetTile) this.revealExplorerTile(targetTile);
    }
    mapView.container.removeChild(sprite);
    sprite.destroy();
    this.host.render();
  }

  /** Lift the fog from a single explorer cell once the scout arrives there. */
  private revealExplorerTile(tile: MapTile): void {
    const local = useGameStore.getState().localPlayerIndex;
    if (!isExploredFor(tile, local)) {
      (tile.exploredBy ??= []).push(local);
      this.spawnFogReveal(tile);
    }
    this.host.render();
  }

  private presentCaptured(e: Extract<GameEvent, { type: 'captured' }>): void {
    const sim = this.host.sim();
    if (!sim) return;
    const capturer = sim.players[e.newOwner]!;
    const village = tileAt(sim.map, e.q, e.r);
    if (e.oldOwner !== null && village) {
      this.showCaptureMessage(village, capturer);
    }
    if (e.ownerDied && e.oldOwner !== null) {
      const dead = sim.players[e.oldOwner]!;
      const tribe = TRIBES.find((t) => t.id === dead.tribe);
      if (tribe) useGameStore.getState().setCenterMessage(t('msg.tribeDied', { tribe: tribe.name }));
    }
  }

  private showCaptureMessage(village: MapTile, capturer: Player): void {
    const store = useGameStore.getState();
    const local = store.players[store.localPlayerIndex];
    const known = new Set<number>();
    if (local) {
      known.add(local.tribe);
      for (const t of local.knownTribes ?? []) known.add(t);
    }
    const tribe = TRIBES.find((t) => t.id === capturer.tribe);
    const name = tribe && known.has(capturer.tribe) ? tribe.name : t('ui.unknownTribe');
    const villageName = village.settlement!.name ?? t('tile.Settlement');
    store.setCenterMessage(t('msg.captured', { village: villageName, tribe: name }));
  }

  private presentTurnStarted(playerIndex: number, turn: number): void {
    const store = useGameStore.getState();
    const player = store.players[playerIndex];
    if (!player) return;
    store.setCurrentPlayerIndex(playerIndex);
    store.setTurn(turn);
    // Keep the last selected hex between turns.
    store.setAiActive(playerIndex !== store.localPlayerIndex);
    if (playerIndex === store.localPlayerIndex) store.setCenterMessage(t('msg.yourTurn'));
    if (playerIndex === store.localPlayerIndex && store.netMode === 'single') this.host.saveGame();
  }

  private presentGameOver(winnerIndex: number, bonus: number): void {
    const store = useGameStore.getState();
    store.setWinnerIndex(winnerIndex);
    store.setGameOver(true);
    store.setAiActive(false);
    store.setSelection(null);
    saveRepository.clear();
  }

  private spawnScoreFly(tile: MapTile, playerIndex: number, amount: number): void {
    const local = useGameStore.getState().localPlayerIndex;
    if (playerIndex !== local && !isExploredFor(tile, local)) return;
    this.spawnFloatText(tile, `+${amount}`, 0xffd700);
  }

  private spawnHpText(tile: MapTile, text: string, color: number): void {
    const local = useGameStore.getState().localPlayerIndex;
    if (!isExploredFor(tile, local)) return;
    this.spawnFloatText(tile, text, color);
  }

  private spawnFloatText(tile: MapTile, text: string, color: number): void {
    const app = this.host.app();
    const mapRoot = this.host.mapRoot();
    if (!app || !mapRoot) return;
    const camera = this.host.camera();
    const scale = camera.scale;
    const world = hexToPixel(tile, HEX_SIZE);
    const el = new Container();
    el.zIndex = 10;
    const label = new Text({
      text,
      style: { fontSize: 20, fill: color, fontWeight: '800' },
    });
    label.anchor.set(0.5);
    el.addChild(label);
    const start = {
      x: camera.pan.x + world.x * scale,
      y: camera.pan.y + (world.y - tileElevation(tile, HEX_SIZE)) * scale,
    };
    el.position.set(start.x, start.y);
    mapRoot.addChild(el);

    const FLOAT_RISE = 44;
    const FLOAT_MS = 900;
    const tickStart = performance.now();
    const ticker = app.ticker;
    const fn = (): void => {
      const t = Math.min(1, (performance.now() - tickStart) / FLOAT_MS);
      el.position.set(start.x, start.y - FLOAT_RISE * t);
      el.alpha = t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5;
      if (t >= 1) {
        ticker.remove(fn);
        mapRoot.removeChild(el);
        el.destroy();
      }
    };
    ticker.add(fn);
  }

  /** Spawns a projectile that flies along an arc from the attacker's hex to the
 *  target's hex center, rotating to follow the trajectory, and removes itself
 *  on arrival. The texture points right; leftward shots are flipped
 *  horizontally so the projectile never appears upside-down. */
  private spawnProjectile(
    fromTile: MapTile,
    toTile: MapTile,
    texture: Texture,
    heightPx: number,
    /** Multiplier applied to the arc height. 1 keeps the standard archer/ship
     *  lob; catapults use a higher value for a loftier trajectory. */
    arcFactor = 1,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const app = this.host.app();
      const mapRoot = this.host.mapRoot();
      if (!app || !mapRoot) {
        resolve();
        return;
      }
      const camera = this.host.camera();
      const scale = camera.scale;
      const fromWorld = hexToPixel(fromTile, HEX_SIZE);
      const toWorld = hexToPixel(toTile, HEX_SIZE);
      const px = (world: { x: number; y: number }, tile: MapTile): { x: number; y: number } => ({
        x: camera.pan.x + world.x * scale,
        y: camera.pan.y + (world.y - tileElevation(tile, HEX_SIZE)) * scale,
      });
      const start = px(fromWorld, fromTile);
      const end = px(toWorld, toTile);
      const dist = Math.hypot(end.x - start.x, end.y - start.y) || 1;
      // Arc apex above the straight line, scaled with the camera.
      const arcHeight = Math.max(10, Math.min(44, dist * 0.3) * arcFactor) * Math.max(1, scale);

      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      // Fixed `heightPx`-tall projectile; scale keeps the texture aspect ratio.
      const base = (heightPx / (texture.height || 1)) * Math.max(1, scale);
      sprite.scale.set(base, base);
      sprite.zIndex = 12;
      mapRoot.addChild(sprite);
      sprite.position.set(start.x, start.y);

      const startTime = performance.now();
      const ticker = app.ticker;
      let finished = false;
      const flightMs = Math.max(1, hexDistance(fromTile, toTile)) * PROJECTILE_MS_PER_TILE;
      const finish = (): void => {
        if (finished) return;
        finished = true;
        ticker.remove(fn);
        mapRoot.removeChild(sprite);
        sprite.destroy();
        resolve();
      };
      const fn = (): void => {
        const t = Math.min(1, (performance.now() - startTime) / flightMs);
        // Position follows a linear x/y path with an upward sine-bulge.
        const k = Math.sin(t * Math.PI);
        const x = start.x + (end.x - start.x) * t;
        const y = start.y + (end.y - start.y) * t - arcHeight * k;
        sprite.position.set(x, y);
        // The tangent of the arc: derive the y-bulge term and rotate to match.
        const dx = end.x - start.x;
        const dy = end.y - start.y - arcHeight * Math.PI * Math.cos(t * Math.PI);
        const angle = Math.atan2(dy, dx);
        const leftward = Math.cos(angle) < 0;
        // Pixi applies scale then rotation: with scale.x = -1 the sprite's +x
        // axis maps to (-cos rot, -sin rot). Flip into the mirrored angle so the
        // projectile still points along the trajectory while the texture stays
        // upright (never upside-down on leftward shots).
        if (leftward) {
          sprite.scale.x = -base;
          sprite.rotation = angle > 0 ? angle - Math.PI : angle + Math.PI;
        } else {
          sprite.scale.x = base;
          sprite.rotation = angle;
        }
        if (t >= 1) finish();
      };
      ticker.add(fn);
    });
  }

  /** Archer shot: a 5px-tall arrow projectile (fire-and-forget). */
  private spawnArrow(fromTile: MapTile, toTile: MapTile): void {
    this.spawnArrowFromTo(fromTile, toTile).catch(() => {});
  }

  /** Ship shot: a cannonball projectile (fire-and-forget). */
  private spawnCannonball(fromTile: MapTile, toTile: MapTile): void {
    this.spawnCannonballFromTo(fromTile, toTile, false).catch(() => {});
  }

  /** Catapult shot: a cannonball lobbed on a loftier arc (fire-and-forget). */
  private spawnCatapultBall(fromTile: MapTile, toTile: MapTile): void {
    this.spawnCannonballFromTo(fromTile, toTile, true).catch(() => {});
  }

  /** Arrow projectile that resolves when the shot has landed. */
  private spawnArrowFromTo(fromTile: MapTile, toTile: MapTile): Promise<void> {
    const texture = this.host.textures()?.arrowTexture;
    if (!texture) return Promise.resolve();
    return this.spawnProjectile(fromTile, toTile, texture, 5);
  }

  /** Cannonball projectile that resolves when the shot has landed; catapults
   *  use a loftier arc. */
  private spawnCannonballFromTo(fromTile: MapTile, toTile: MapTile, catapult: boolean): Promise<void> {
    const texture = this.host.textures()?.cannonballTexture;
    if (!texture) return Promise.resolve();
    return this.spawnProjectile(fromTile, toTile, texture, 10, catapult ? 2.2 : 1);
  }

  private spawnDeath(tile: MapTile): void {
    const app = this.host.app();
    const mapRoot = this.host.mapRoot();
    if (!app || !mapRoot) return;
    const camera = this.host.camera();
    const scale = camera.scale;
    const world = hexToPixel(tile, HEX_SIZE);
    const el = new Container();
    el.zIndex = 10;
    const particles: { g: Graphics; x0: number; swing: number; phase: number; opacity: number; delay: number }[] = [];
    for (let i = 0; i < DEATH_PARTICLE_COUNT; i++) {
      const g = new Graphics();
      const size = 4 + Math.random() * 12;
      const opacity = 0.3 + Math.random() * 0.5;
      g.rect(-size / 2, -size / 2, size, size).fill({ color: 0xffffff, alpha: opacity });
      g.alpha = 0;
      el.addChild(g);
      particles.push({
        g,
        x0: (Math.random() - 0.5) * 24,
        swing: 6 + Math.random() * 14,
        phase: Math.random() * Math.PI * 2,
        opacity,
        delay: Math.random() * DEATH_STAGGER_MS,
      });
    }
    el.position.set(
      camera.pan.x + world.x * scale,
      camera.pan.y + (world.y - tileElevation(tile, HEX_SIZE)) * scale,
    );
    mapRoot.addChild(el);

    const tickStart = performance.now();
    const ticker = app.ticker;
    const fn = (): void => {
      const age = performance.now() - tickStart;
      for (const p of particles) {
        const localAge = age - p.delay;
        if (localAge <= 0) continue;
        const t = Math.min(1, localAge / DEATH_MS);
        p.g.position.set(p.x0 + Math.sin(t * Math.PI * 2 + p.phase) * p.swing, -DEATH_RISE * t);
        p.g.alpha = p.opacity * (1 - t);
      }
      if (age >= DEATH_MS + DEATH_STAGGER_MS) {
        ticker.remove(fn);
        mapRoot.removeChild(el);
        el.destroy();
      }
    };
    ticker.add(fn);
  }

  private spawnFogReveal(tile: MapTile): void {
    const app = this.host.app();
    const mapRoot = this.host.mapRoot();
    const textures = this.host.textures();
    if (!app || !mapRoot || !textures) return;
    const fog = textures.fogTopTexture;
    const sprite = new Sprite(fog.texture);
    sprite.anchor.set(0.5, fog.anchorY);
    const camera = this.host.camera();
    const scale = camera.scale;
    const world = hexToPixel(tile, HEX_SIZE);
    sprite.scale.set(camera.spriteScale * scale, camera.spriteScale * scale);
    sprite.position.set(
      camera.pan.x + world.x * scale,
      camera.pan.y + (world.y - tileElevation(tile, HEX_SIZE)) * scale,
    );
    const el = new Container();
    el.addChild(sprite);
    el.zIndex = 10;
    mapRoot.addChild(el);

    const score = makeLabel(`+${EXPLORED_SCORE}`, { fontSize: 16, fill: 0xffffff, fontWeight: '700' });
    score.anchor.set(0.5, 0.5);
    const fogH = sprite.height;
    score.position.set(
      sprite.position.x,
      sprite.position.y - (fog.anchorY - 0.5) * fogH,
    );
    el.addChild(score);

    const FOG_MS = 900;
    const FOG_RISE = 60;
    const tickStart = performance.now();
    const ticker = app.ticker;
    const fn = (): void => {
      const t = Math.min(1, (performance.now() - tickStart) / FOG_MS);
      el.position.set(0, -FOG_RISE * t);
      el.alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      if (t >= 1) {
        ticker.remove(fn);
        mapRoot.removeChild(el);
        el.destroy();
      }
    };
    ticker.add(fn);
  }

  private tweenSpriteTo(sprite: Sprite, to: { x: number; y: number }, ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const from = { x: sprite.position.x, y: sprite.position.y };
      const start = performance.now();
      const tick = (): void => {
        const t = Math.min(1, (performance.now() - start) / ms);
        sprite.position.set(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
        if (t >= 1) {
          resolve();
        } else {
          requestAnimationFrame(tick);
        }
      };
      tick();
    });
  }
}
