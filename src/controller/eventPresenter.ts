import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
import { Simulator } from '../game/simulator';
import { AttackUnitPre, GameEvent } from '../game/events';
import { MapTile } from '../game/mapGen';
import { Player } from '../game/players';
import { TRIBES } from '../game/tribes';
import { canAttack, canMove, HEAL_AMOUNT, PIRATE_OWNER, Unit, UNIT_TYPES } from '../game/units';
import { tileAt } from '../game/selection';
import { isExploredFor } from '../game/explore';
import { axialKey, hexToPixel } from '../game/hex';
import { tileElevation } from '../render/elevation';
import { MapView } from '../render/mapRenderer';
import { TextureSet } from '../render/textureFactory';
import { useGameStore } from '../store/gameStore';
import { EXPLORED_SCORE } from '../game/score';
import { makeLabel } from '../ui/kit/label';
import { saveRepository } from '../storage/saveGame';
import { BonusKind } from '../game/bonus';
import { SKILLS } from '../game/skills';
import { CameraController } from './cameraController';

const HEX_SIZE = 40;

const SCORE_FLY_PHASE1_MS = 200;
const SCORE_FLY_PHASE2_MS = 900;
const SCORE_FLY_RISE = 48;
const SCORE_FLY_ARC = 140;

const DEATH_PARTICLE_COUNT = 10;
const DEATH_RISE = 200;
const DEATH_MS = 1000;

const COMBAT_DEATH_GAP_MS = 350;
const COMBAT_ADVANCE_MS = 180;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  private deferExplorerFog(events: GameEvent[], local: number): Set<string> {
    const keys = new Set<string>();
    for (const e of events) {
      if (e.type !== 'explorer' || e.playerIndex !== local) continue;
      keys.add(axialKey({ q: e.q, r: e.r }));
      for (const s of e.path) keys.add(axialKey(s));
    }
    this.setLocalExplored(keys, false);
    return keys;
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
    const deferredFog = this.deferExplorerFog(events, local);
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
    try {
      for (const e of events) {
        switch (e.type) {
          case 'unitMoved':
            await this.presentUnitMoved(e);
            break;
          case 'attack':
            await this.presentAttack(e);
            break;
          case 'spawned':
            break;
          case 'captured':
            this.presentCaptured(e);
            break;
          case 'villageUpgraded':
            break;
          case 'built':
            break;
          case 'templeGrown':
            break;
          case 'skillOpened':
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
            useGameStore.getState().setCenterMessage('Pirates!');
            break;
          case 'pirateCapture': {
            if (e.playerIndex === useGameStore.getState().localPlayerIndex) {
              useGameStore.getState().setCenterMessage(
                e.success ? 'Your ship is captured by pirates!' : 'The attempt to capture your ship has failed',
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
    }
    if (movedIds.size > 0) this.host.render();
  }

  private async presentAttack(e: Extract<GameEvent, { type: 'attack' }>): Promise<void> {
    const sim = this.host.sim();
    if (!sim) return;
    const local = useGameStore.getState().localPlayerIndex;
    const attackerTile = tileAt(sim.map, e.attackerTile.q, e.attackerTile.r);
    const targetTile = tileAt(sim.map, e.targetTile.q, e.targetTile.r);
    const attackerVisible = attackerTile !== undefined && isExploredFor(attackerTile, local);
    const targetVisible = targetTile !== undefined && isExploredFor(targetTile, local);
    const mapView = this.host.mapView();

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
        await this.presentStagedAttack(e, attackerTile, targetTile, targetVisible, attackerAdvanced, facing);
      } finally {
        mapView.setUnitOverrides(null);
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
      if (e.missed) {
        if (targetTile && attackerVisible) this.spawnHpText(targetTile, 'Miss', 0xffa500);
      } else {
        if (e.attackerDamage > 0 && targetTile && attackerVisible) this.spawnHpText(targetTile, `-${e.attackerDamage}`, 0xff4444);
        if (e.targetDamage > 0 && attackerTile && targetVisible) this.spawnHpText(attackerTile, `-${e.targetDamage}`, 0xff4444);
      }
      if (e.targetDied && targetTile && targetVisible) this.spawnDeath(targetTile);
      if (e.attackerDied && attackerTile && attackerVisible) this.spawnDeath(attackerTile);
    }
    this.keepAttackerSelected(e);
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
   * Order: attack lunge → -hp text → hp bars drop → death burst (unit fades out)
   * → attacker walks onto the vacated tile.
   */
  private async presentStagedAttack(
    e: Extract<GameEvent, { type: 'attack' }>,
    attackerTile: MapTile,
    targetTile: MapTile,
    targetVisible: boolean,
    attackerAdvanced: boolean,
    facing: 'left' | 'right',
  ): Promise<void> {
    const mapView = this.host.mapView();
    if (!mapView) return;
    const local = useGameStore.getState().localPlayerIndex;
    const attackerKey = axialKey(attackerTile);
    const targetKey = axialKey(targetTile);
    const attacker = this.stageUnit(e.attackerPre!, e.attackerId, attackerTile.q, attackerTile.r);
    const target = this.stageUnit(e.targetPre!, e.targetId, targetTile.q, targetTile.r);
    const staged = new Map<string, Unit | null>([
      [attackerKey, attacker],
      [targetKey, target],
    ]);
    mapView.setUnitOverrides(staged);
    this.host.render();
    mapView.faceUnitAtKey(attackerKey, facing);

    const scale = this.host.camera().scale;
    await mapView.lungeUnit(attackerKey, targetKey, 10 / scale);

    if (e.attackerDamage > 0) this.spawnHpText(targetTile, `-${e.attackerDamage}`, 0xff4444);
    if (e.targetDamage > 0) this.spawnHpText(attackerTile, `-${e.targetDamage}`, 0xff4444);
    attacker.hp = Math.max(0, attacker.hp - e.targetDamage);
    target.hp = Math.max(0, target.hp - e.attackerDamage);
    this.host.render();

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
    for (const step of steps) {
      const to = hexToPixel(step, HEX_SIZE);
      const targetTile = tileAt(map, step.q, step.r);
      const y = targetTile ? to.y - tileElevation(targetTile, HEX_SIZE) : to.y;
      await this.tweenSpriteTo(sprite, { x: to.x, y }, 110);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    this.host.hiddenUnitIds().delete(unit.id);
    mapView.container.removeChild(sprite);
    sprite.destroy();
    this.host.render();
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
      if (e.skill) store.setCenterMessage(`Skill ${SKILLS[e.skill].name} opened!`);
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
      if (tribe) useGameStore.getState().setCenterMessage(`${tribe.name} died!`);
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
    const name = tribe && known.has(capturer.tribe) ? tribe.name : 'Unknown tribe';
    store.setCenterMessage(`${village.settlement!.name ?? 'Settlement'} is captured by ${name}!`);
  }

  private presentTurnStarted(playerIndex: number, turn: number): void {
    const store = useGameStore.getState();
    const player = store.players[playerIndex];
    if (!player) return;
    store.setCurrentPlayerIndex(playerIndex);
    store.setTurn(turn);
    store.setSelection(null);
    store.setAiActive(playerIndex !== store.localPlayerIndex);
    if (playerIndex === store.localPlayerIndex) store.setCenterMessage('Your turn!');
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
    const app = this.host.app();
    const mapRoot = this.host.mapRoot();
    if (!app || !mapRoot) return;
    const camera = this.host.camera();
    const scale = camera.scale;
    const world = hexToPixel(tile, HEX_SIZE);
    const el = new Container();
    el.zIndex = 10;
    const circle = new Graphics();
    circle.circle(0, 0, 24).fill(0xffd700).stroke({ width: 3, color: 0xd4a017 });
    el.addChild(circle);
    const text = new Text({
      text: `+${amount}`,
      style: { fontSize: 18, fill: 0x1a1a2e, fontWeight: '800' },
    });
    text.anchor.set(0.5);
    el.addChild(text);
    const start = { x: camera.pan.x + world.x * scale, y: camera.pan.y + world.y * scale };
    const top = { x: start.x, y: start.y - SCORE_FLY_RISE };
    const target = { x: app.screen.width - 40, y: 40 };
    const mid = { x: (top.x + target.x) / 2, y: (top.y + target.y) / 2 };
    const arc = { x: mid.x, y: mid.y - SCORE_FLY_ARC };
    el.position.set(start.x, start.y);
    el.scale.set(0.5, 0.5);
    mapRoot.addChild(el);

    const tickStart = performance.now();
    const ticker = app.ticker;
    const fn = (): void => {
      const elapsed = performance.now() - tickStart;
      const raw = Math.min(1, elapsed / (SCORE_FLY_PHASE1_MS + SCORE_FLY_PHASE2_MS));
      if (elapsed < SCORE_FLY_PHASE1_MS) {
        const p1 = elapsed / SCORE_FLY_PHASE1_MS;
        el.position.set(start.x, start.y + (top.y - start.y) * p1);
      } else {
        const p2 = Math.min(1, (elapsed - SCORE_FLY_PHASE1_MS) / SCORE_FLY_PHASE2_MS);
        const t = p2 * p2;
        const inv = 1 - t;
        el.position.set(
          inv * inv * top.x + 2 * inv * t * arc.x + t * t * target.x,
          inv * inv * top.y + 2 * inv * t * arc.y + t * t * target.y,
        );
      }
      const grow = 0.5 + 1.1 * raw;
      el.scale.set(grow, grow);
      el.alpha = raw < 0.7 ? 1 : 1 - (raw - 0.7) / 0.3;
      if (raw >= 1) {
        ticker.remove(fn);
        mapRoot.removeChild(el);
        el.destroy();
      }
    };
    ticker.add(fn);
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

  private spawnDeath(tile: MapTile): void {
    const app = this.host.app();
    const mapRoot = this.host.mapRoot();
    if (!app || !mapRoot) return;
    const camera = this.host.camera();
    const scale = camera.scale;
    const world = hexToPixel(tile, HEX_SIZE);
    const el = new Container();
    el.zIndex = 10;
    const particles: { g: Graphics; x0: number; swing: number; phase: number; opacity: number }[] = [];
    for (let i = 0; i < DEATH_PARTICLE_COUNT; i++) {
      const g = new Graphics();
      const radius = 3 + Math.random() * 15;
      const opacity = 0.1 + Math.random() * 0.3;
      g.circle(0, 0, radius).fill({ color: 0xffffff, alpha: opacity });
      el.addChild(g);
      particles.push({
        g,
        x0: (Math.random() - 0.5) * 24,
        swing: 6 + Math.random() * 14,
        phase: Math.random() * Math.PI * 2,
        opacity,
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
      const t = Math.min(1, (performance.now() - tickStart) / DEATH_MS);
      for (const p of particles) {
        p.g.position.set(p.x0 + Math.sin(t * Math.PI * 2 + p.phase) * p.swing, -DEATH_RISE * t);
        p.g.alpha = p.opacity * (1 - t);
      }
      if (t >= 1) {
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
