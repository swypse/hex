import { BUILDING_NAMES } from '../game/economy/buildings';
import { Application, Container, Sprite } from 'pixi.js';
import { Simulator } from '../game/simulator';
import { type AttackUnitPre, type GameEvent } from '../game/events';
import { type MapTile } from '../game/map/map-gen';
import { type Player } from '../game/players';
import { tribeById } from '../game/tribes';
import { canAttack, canMove, HEAL_AMOUNT, PIRATE_OWNER, type Unit, UNIT_TYPES } from '../game/units/units';
import { isWaterType } from '../game/map/tile-types';
import { claimingVillage, villageWaterTiles } from '../game/units/storm';
import { isExploredFor } from '../game/map/explore';
import { axialKey, hexDistance, hexToPixel, tilesInRange, type Axial } from '../game/map/hex';
import { compassDirection, weatherCopies, type WeatherBuildingHit, type WeatherEvent, type WeatherUnitHit } from '../game/weather/weather';
import { tileElevation } from '../render/elevation';
import { MapView } from '../render/map-renderer';
import { spawnShipWake } from '../render/wake';
import { type TextureSet } from '../render/texture-factory';
import { useGameStore } from '../store/game-store';
import { saveRepository } from '../storage/save-game';
import { SKILLS } from '../game/skills';
import { achievementIcon, achievementNameKey } from '../game/achievements';
import { CameraController } from './camera-controller';
import { initialAttackHpOverrides, hpOverrideAfterAttack } from './attack-hp';
import { attackPresenceParticipants, type AttackPresenceParticipant } from './attack-presence';
import { t } from '../i18n';
import { sfx } from '../sound/sfx';
import { attackSound } from '../sound/attack-sounds';
import { AttackImpact, BonusKind, GameEventType, NetMode, SelectionKind, UnitFacing, UnitType, WeatherType } from '@enums';
import { sleep } from '../util/sleep';
import { tileAt } from '../game/map/tile-index';
import { EventEffects } from './event-effects';

const HEX_SIZE = 40;

const COMBAT_DEATH_GAP_MS = 350;
const COMBAT_ADVANCE_MS = 180;


const ACH_CHIP_BG = 0x373748;
const ACH_CHIP_SIZE = 64;

/** Pause after one of the local player's own (or visible ally) events. */
const EVENT_PAUSE_MS = 150;
/** Pause after a visible enemy/AI event: shorter so AI turns don't crawl. */
const ENEMY_EVENT_PAUSE_MS = 50;
/** Walk tween per hex (ms) and gap between hexes, own vs enemy units. */
const OWN_STEP_MS = 110;
const OWN_STEP_GAP_MS = 60;
const ENEMY_STEP_MS = 70;
const ENEMY_STEP_GAP_MS = 10;

/** Events that only update state / HUD and leave nothing to wait for. */
const INSTANT_EVENTS: ReadonlySet<GameEvent['type']> = new Set<GameEvent['type']>([
  GameEventType.AI_TURN,
  GameEventType.TURN_STARTED,
  GameEventType.SPAWNED,
  GameEventType.BUILT,
  GameEventType.TEMPLE_GROWN,
  GameEventType.SKILL_OPENED,
  GameEventType.SHIP_UPGRADED,
  GameEventType.SHIP_REVERTED,
  GameEventType.SEASON_CHANGED,
  GameEventType.SCORE_FLY,
  GameEventType.KNIGHT_COMBO,
  GameEventType.ACHIEVEMENT_UNLOCKED,
]);

/** Tiles an event happens on (empty when it has no location). */
function eventTiles(e: GameEvent): { q: number; r: number }[] {
  const out: { q: number; r: number }[] = [];
  const rec = e as unknown as Record<string, unknown>;
  const isAxial = (v: unknown): v is { q: number; r: number } =>
    typeof v === 'object' && v !== null && typeof (v as { q?: unknown }).q === 'number' && typeof (v as { r?: unknown }).r === 'number';
  if (typeof rec.q === 'number' && typeof rec.r === 'number') out.push({ q: rec.q, r: rec.r });
  for (const key of ['from', 'to', 'attackerTile', 'targetTile']) {
    const v = rec[key];
    if (isAxial(v)) out.push(v);
  }
  return out;
}

/** Whether `local` is the actor of an event (its own action: keep the full pause). */
function isLocalActor(e: GameEvent, local: number): boolean {
  const rec = e as unknown as Record<string, unknown>;
  return rec.playerIndex === local || rec.attackerIndex === local;
}

/** ms to wait after presenting `e`: nothing for instant events and for
 *  enemy events the local player cannot see (fogged tiles), a short beat for
 *  visible enemy actions, the full beat for the local player's own. */
export function pauseAfterEvent(e: GameEvent, local: number, isExplored: (q: number, r: number) => boolean): number {
  if (INSTANT_EVENTS.has(e.type)) return 0;
  if (isLocalActor(e, local)) return EVENT_PAUSE_MS;
  const tiles = eventTiles(e);
  if (tiles.length === 0 || !tiles.some((t) => isExplored(t.q, t.r))) return 0;
  return ENEMY_EVENT_PAUSE_MS;
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
  runSeasonTransition(tiles: { q: number; r: number }[]): Promise<void>;
  syncKnownTribes(notify: boolean): void;
  enqueue(task: () => Promise<void>): Promise<void>;
  bringCellIntoView(q: number, r: number): Promise<void>;
  /** Centers the camera on a cell regardless of what is visible. */
  centerOnCell(q: number, r: number): Promise<void>;
  exploredKeysFor(playerIndex: number): Set<string>;
  saveGame(): void;
}

/** The UNIT_MOVED events of a batch whose mover was stealthed while walking.
 *  The sim holds the batch's final state, so a later reveal (spotted beside a
 *  village, bumped, attacked) means it was stealthed during the move, and a
 *  later stealth enable means it was not. Otherwise the final state decides. */
function stealthedMoveEvents(events: GameEvent[], isStealthedNow: (unitId: string) => boolean): WeakSet<GameEvent> {
  const out = new WeakSet<GameEvent>();
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (e.type !== GameEventType.UNIT_MOVED) continue;
    let stealthed = isStealthedNow(e.unitId);
    for (let j = i + 1; j < events.length; j++) {
      const n = events[j]!;
      if (n.type === GameEventType.STEALTH_REVEALED && n.unitId === e.unitId) { stealthed = true; break; }
      if (n.type === GameEventType.STEALTH_ENABLED && n.unitId === e.unitId) { stealthed = false; break; }
    }
    if (stealthed) out.add(e);
  }
  return out;
}

export class EventPresenter {
  private readonly effects: EventEffects;

  constructor(private readonly host: EventHost) {
    this.effects = new EventEffects(host);
  }

  /** Static sprites that keep enemy units visible at their starting hex until
   * their own move animation begins (they are otherwise hidden up front). */
  private moveGhosts: { unitId: string; sprite: Sprite }[] = [];
  /** Move events of the current batch made while the mover was stealthed. */
  private stealthedMoves = new WeakSet<GameEvent>();

  private findUnitById(unitId: string): Unit | undefined {
    const sim = this.host.sim();
    if (!sim) return undefined;
    const tile = sim.map.tiles.find((t) => t.unit?.id === unitId);
    return tile?.unit ?? undefined;
  }

  private tileOfUnitById(unitId: string): MapTile | undefined {
    const sim = this.host.sim();
    if (!sim) return undefined;
    return sim.map.tiles.find((t) => t.unit?.id === unitId);
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
    const sim = this.host.sim();
    const tile = sim && tileAt(sim.map, q, r);
    if (tile) this.effects.spawnFogReveal(tile);
  }

  /** Keep a player's own explorer path under fog until its scout reaches each
   * cell. Returns the path keys whose local exploration was deferred; callers
   * must restore them (see `restoreDeferredFog`). */
  private deferExplorerFog(events: GameEvent[], local: number, preExplored: Set<string>): Set<string> {
    const pathTiles: { q: number; r: number }[] = [];
    for (const e of events) {
      if (e.type !== GameEventType.EXPLORER || e.playerIndex !== local) continue;
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
      const [q, r] = k.split(',').map(Number);
      const t = tileAt(sim.map, q!, r!);
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
      if (e.type === GameEventType.UNIT_MOVED) {
        movedIds.add(e.unitId);
        this.host.hiddenUnitIds().add(e.unitId);
      }
    }
    // Keep each enemy unit that is about to move visible on its starting hex
    // until its own animation starts (the hide-above would otherwise blank it
    // for the whole opening of the turn).
    this.moveGhosts = [];
    this.stealthedMoves = stealthedMoveEvents(events, (id) => this.findUnitById(id)?.isStealthed === true);
    for (const e of events) {
      if (e.type !== GameEventType.UNIT_MOVED) continue;
      const unit = this.findUnitById(e.unitId);
      if (!unit || unit.owner === local) continue;
      // A stealthed enemy stalker must not leave a ghost on its start hex.
      if (this.stealthedMoves.has(e)) continue;
      const fromTile = tileAt(sim.map, e.from.q, e.from.r);
      if (!fromTile || !isExploredFor(fromTile, local)) continue;
      if (this.moveGhosts.some((g) => g.unitId === unit.id)) continue;
      const sprite = this.makeMoveGhostSprite(unit, e.shipLevel, fromTile);
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
          case GameEventType.UNIT_MOVED:
            await this.presentUnitMoved(e);
            break;
          case GameEventType.ATTACK:
            hadAttack = true;
            await this.presentAttack(e, this.presenceOverrides(events, i + 1), () => this.setPostAttackHp(events, i));
            // Idempotent safety net for early exits inside presentAttack.
            this.setPostAttackHp(events, i);
            this.host.render();
            break;
          case GameEventType.SIEGE:
            hadAttack = true;
            this.presentSiege(e);
            break;
          case GameEventType.SPAWNED:
            if (e.playerIndex === local) sfx.play('spawn');
            break;
          case GameEventType.CAPTURED:
            this.presentCaptured(e);
            break;
          case GameEventType.VILLAGE_UPGRADED: {
            if (e.playerIndex === local) sfx.play('upgrade');
            const tile = tileAt(sim.map, e.q, e.r);
            // No celebration animation; just re-render the upgraded village for
            // the local player's own upgrades (another player's upgrade is
            // their news, not ours).
            if (e.playerIndex === local && tile && isExploredFor(tile, local)) {
              this.host.render();
            }
            break;
          }
          case GameEventType.BUILT:
            break;
          case GameEventType.BUILDING_REPAIRED:
            this.host.render();
            break;
          case GameEventType.BUILDING_DESTROYED:
            this.host.render();
            break;
          case GameEventType.TEMPLE_GROWN:
            break;
          case GameEventType.SKILL_OPENED:
            if (e.playerIndex === local) sfx.play('claim');
            break;
          case GameEventType.HEALED: {
            const unit = this.findUnitById(e.unitId);
            if (unit) {
              const t = tileAt(sim.map, unit.q, unit.r);
              if (t) this.effects.spawnHpText(t, `+${HEAL_AMOUNT}`, 0x44ff44);
            }
            break;
          }
          case GameEventType.SHIP_UPGRADED:
            break;
          case GameEventType.SHIP_REVERTED:
            break;
          case GameEventType.SCORE_FLY: {
            if (e.playerIndex !== useGameStore.getState().localPlayerIndex) break;
            const tile = tileAt(sim.map, e.q, e.r);
            if (tile) this.effects.spawnScoreFly(tile, e.playerIndex, e.amount);
            break;
          }
          case GameEventType.KNIGHT_COMBO: {
            if (e.playerIndex === useGameStore.getState().localPlayerIndex) {
              useGameStore.getState().setCenterMessage(t('msg.comboKill'));
            }
            break;
          }
          case GameEventType.BONUS_CLAIMED:
            this.presentBonusClaimed(e);
            if (e.playerIndex === local) sfx.play('claim');
            break;
          case GameEventType.BOTTLE_COLLECTED:
            this.presentBottleCollected(e);
            break;
          case GameEventType.EXPLORER:
            await this.presentExplorer(e);
            break;
          case GameEventType.STEALTH_ENABLED:
            this.host.render();
            break;
          case GameEventType.STEALTH_REVEALED:
            this.host.render();
            break;
          case GameEventType.STALKER_SPOTTED:
            await this.presentStalkerSpotted(e);
            break;
          case GameEventType.TRAP_PLACED:
            this.host.render();
            break;
          case GameEventType.FIRE_TURN:
            await this.presentWeatherDamage(e.units, e.buildings);
            this.host.render();
            break;
          case GameEventType.FIRE_EXTINGUISHED:
            this.host.render();
            break;
          case GameEventType.ROAD_BURNED: {
            this.host.render();
            const roadTile = tileAt(sim.map, e.q, e.r);
            if (e.owner === local && e.playerIndex !== local) {
              useGameStore.getState().setCenterMessage(t('msg.roadBurned'));
            }
            if (roadTile && isExploredFor(roadTile, local)) this.host.mapView()?.bounceHex(e.q, e.r);
            break;
          }
          case GameEventType.BURNED: {
            this.host.render();
            const victim = tileAt(sim.map, e.q, e.r)?.ownedBy;
            if (victim === local && e.playerIndex !== local) {
              useGameStore.getState().setCenterMessage(t('msg.foodBuildingBurned', { building: BUILDING_NAMES[e.kind] }));
            }
            break;
          }
          case GameEventType.STARVATION: {
            for (const u of e.units) {
              const ut = tileAt(sim.map, u.q, u.r);
              if (ut && u.damage > 0 && isExploredFor(ut, local)) this.effects.spawnHpText(ut, `-${u.damage}`, 0xff4d4d);
            }
            this.host.render();
            break;
          }
          case GameEventType.TRAP_TRIGGERED: {
            this.host.render();
            const t = tileAt(sim.map, e.q, e.r);
            if (t) this.effects.spawnHpText(t, `-${e.damage}`, 0xff6666);
            break;
          }
          case GameEventType.STORM: {
            // Storming clears the unit's selection (its turn is spent), so
            // render the deselection first: otherwise the render below the
            // pulse would see the selection just changed to null and stop the
            // hex-bounce animation it shares with the pulse, killing it before
            // its first tick.
            this.host.render();
            const stormcaller = tileAt(sim.map, e.q, e.r);
            if (stormcaller) {
              const village = claimingVillage(sim.map, stormcaller);
              const mapView = this.host.mapView();
              if (village && mapView) {
                mapView.stormWaterPulse(villageWaterTiles(sim.map, village), { q: e.q, r: e.r });
              }
            }
            for (const target of e.targets) {
              const t = tileAt(sim.map, target.q, target.r);
              if (t) this.effects.spawnHpText(t, `-${target.damage}`, 0x88ccff);
            }
            break;
          }
          case GameEventType.STUN_SHOT: {
            const from = tileAt(sim.map, e.attackerTile.q, e.attackerTile.r);
            const to = tileAt(sim.map, e.targetTile.q, e.targetTile.r);
            const tex = this.host.textures()?.cannonbalTexture;
            if (from && to && tex) {
              await this.effects.spawnProjectile(from, to, tex, 26);
            }
            if (!e.missed) this.host.render();
            break;
          }
          case GameEventType.SEASON_CHANGED: {
            this.host.render();
            const store = useGameStore.getState();
            // Water that froze and ice that thawed bounce top row to bottom.
            // The render above comes first so a pending selection clear can't
            // cancel the wave (shared hex-bounce slot).
            const changed = [...e.frozen, ...e.thawed].filter((c) => {
              const ct = tileAt(sim.map, c.q, c.r);
              return ct && isExploredFor(ct, local);
            });
            await this.host.runSeasonTransition(changed);
            // Units lost to melting ice (and pirate ships lost to freezing)
            // are already gone from the sim: play their death burst in place.
            const lost = [...e.killed, ...e.removed.map((p) => ({ q: p.q, r: p.r }))];
            let burst = false;
            for (const k of lost) {
              const kt = tileAt(sim.map, k.q, k.r);
              if (kt && isExploredFor(kt, local)) {
                this.effects.spawnDeath(kt);
                burst = true;
              }
            }
            if (burst) await sleep(COMBAT_DEATH_GAP_MS);
            if (e.killed.some((k) => k.owner === local)) store.setCenterMessage(t('msg.iceMelted'));
            else if (e.landed.some((l) => l.owner === local)) store.setCenterMessage(t('msg.iceLanded'));
            break;
          }
          case GameEventType.WEATHER_STARTED:
            await this.presentWeatherStarted(e.weather);
            break;
          case GameEventType.WEATHER_ENDED:
            await this.presentWeatherEnded(e.weather);
            break;
          case GameEventType.WEATHER_MOVED:
            this.syncWeatherStore();
            this.host.render();
            break;
          case GameEventType.WEATHER_DAMAGE:
            await this.presentWeatherDamage(e.units, e.buildings);
            break;
          case GameEventType.TURN_STARTED:
            this.presentTurnStarted(e.playerIndex, e.turn);
            break;
          case GameEventType.AI_TURN:
            useGameStore.getState().setCurrentPlayerIndex(e.playerIndex);
            break;
          case GameEventType.PIRATE_SPAWNED:
            useGameStore.getState().setCenterMessage(t('msg.pirates'));
            break;
          case GameEventType.PIRATE_CAPTURE: {
            if (e.playerIndex === useGameStore.getState().localPlayerIndex) {
              useGameStore.getState().setCenterMessage(
                e.success ? t('msg.shipCaptured') : t('msg.shipCaptureFailed'),
              );
            }
            break;
          }
          case GameEventType.PIRATE_DEAL: {
            if (e.playerIndex === useGameStore.getState().localPlayerIndex) {
              useGameStore.getState().setCenterMessage(t('msg.pirateDeal'));
            }
            break;
          }
          case GameEventType.PIRATE_DEAL_CANCELED: {
            if (e.playerIndex === useGameStore.getState().localPlayerIndex) {
              useGameStore.getState().setCenterMessage(t('msg.pirateDealCanceled'));
            }
            break;
          }
          case GameEventType.ACHIEVEMENT_UNLOCKED: {
            if (e.playerIndex === useGameStore.getState().localPlayerIndex) {
              useGameStore.getState().setCenterMessage(
                t('ach.unlocked', { name: t(achievementNameKey(e.achievement)) }),
                achievementIcon(e.achievement),
                { size: ACH_CHIP_SIZE, bgColor: ACH_CHIP_BG },
              );
            }
            break;
          }
          case GameEventType.GAME_OVER:
            this.presentGameOver(e.winnerIndex, e.bonus);
            break;
        }
        const pause = pauseAfterEvent(e, local, (q, r) => {
          const tile = tileAt(sim.map, q, r);
          return tile !== undefined && isExploredFor(tile, local);
        });
        if (pause > 0) await sleep(pause);
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
   *  post-battle hp when none follows). Only these two units are touched: every
   *  other unit keeps its pre-batch hp hold until its own attack plays. */
  private setPostAttackHp(events: GameEvent[], index: number): void {
    const mapView = this.host.mapView();
    if (!mapView) return;
    for (const step of hpOverrideAfterAttack(events, index)) {
      mapView.setHpOverride(step.unitId, step.hp);
    }
  }

  /** `settleHp` moves the attack's two units from their held pre-attack hp to
   *  the hp they show afterwards; it runs right before the final render so the
   *  bar never flashes back to the pre-attack value or the final sim hp. */
  private async presentAttack(
    e: Extract<GameEvent, { type: 'attack' }>,
    keep: Map<string, Unit>,
    settleHp: () => void,
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

    let attackerShot: Promise<void> | null = null;
    // Land archers shoot a visible arrow projectile along an arc to the target.
    if (
      plan.launch === 'arcShot' &&
      attackerVisible &&
      attackerTile !== undefined &&
      targetTile !== undefined
    ) {
      attackerShot = this.effects.spawnArrowFromTo(attackerTile, targetTile);
    }
    // Ships and pirates fire a cannonball projectile along the same trajectory.
    if (
      (e.attackerPre?.shipLevel !== undefined || e.attackerPre?.type === UnitType.PIRATE) &&
      attackerVisible &&
      attackerTile !== undefined &&
      targetTile !== undefined
    ) {
      this.effects.spawnMuzzleSmokeAt(attackerTile);
      attackerShot = this.effects.spawnCannonballFromTo(attackerTile, targetTile, false);
    }
    // Catapults lob a cannonball projectile on a higher arc at their ranged target.
    if (
      e.attackerPre?.type === UnitType.CATAPULT &&
      attackerVisible &&
      attackerTile !== undefined &&
      targetTile !== undefined
    ) {
      attackerShot = this.effects.spawnCannonballFromTo(attackerTile, targetTile, true);
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
    let facing: UnitFacing = UnitFacing.RIGHT;
    if (attackerTile && targetTile) {
      const ax = hexToPixel(e.attackerTile, HEX_SIZE).x;
      const tx = hexToPixel(e.targetTile, HEX_SIZE).x;
      facing = tx < ax ? UnitFacing.LEFT : UnitFacing.RIGHT;
      mapView?.setUnitFacing(e.attackerId, facing);
    }

    if (mapView && !e.missed && attackerTile && targetTile && attackerVisible && e.attackerPre && e.targetPre) {
      try {
        if (attackerAdvanced) {
          // Kill-and-advance: skip the lunge/strike choreography and play the
          // walk onto the vacated cell directly.
          await this.presentKillAdvance(e, attackerTile, targetTile, targetVisible, facing, keep);
        } else {
          await this.presentStagedAttack(e, attackerTile, targetTile, targetVisible, attackerAdvanced, facing, impact, keep, attackerShot);
        }
      } finally {
        settleHp();
        mapView.setUnitOverrides(keep);
        this.host.render();
      }
    } else {
      if (attackerTile && targetTile && attackerVisible) {
        const scale = this.host.camera().scale;
        await this.host.mapView()?.lungeUnit(axialKey(attackerTile), axialKey(targetTile), 10 / scale);
      }
      // The batch-wide pre-attack holds (set in `present`) keep both bars at
      // their old hp through the lunge; they only move once the hit lands.
      // Never clear every hold here: units with a later attack in this batch
      // must keep showing their pre-batch hp until that attack plays.
      settleHp();
      if (mapView) this.host.render();
      if (!e.missed && impact) sfx.play(impact);
      if (e.missed) {
        if (targetTile && attackerVisible) this.effects.spawnHpText(targetTile, t('msg.miss'), 0xffa500);
      } else {
        if (e.attackerDamage > 0 && targetTile && attackerVisible) this.effects.spawnHpText(targetTile, `-${e.attackerDamage}`, 0xff4444);
        if (e.targetDamage > 0 && attackerTile && targetVisible) this.effects.spawnHpText(attackerTile, `-${e.targetDamage}`, 0xff4444);
      }
      if (e.targetDied && targetTile && targetVisible) this.effects.spawnDeath(targetTile);
      if (e.attackerDied && attackerTile && attackerVisible) this.effects.spawnDeath(attackerTile);
      if (mapView) {
        mapView.setUnitOverrides(keep);
        this.host.render();
      }
    }
    this.keepAttackerSelected(e);
  }

  /** A catapult volley against a structure tile: lob a cannonball at it when
   *  visible, then re-render so the destroyed wall/building/bridge/village
   *  level change shows. A miss only renders the (un)explained event. */
  private async presentSiege(e: Extract<GameEvent, { type: 'siege' }>): Promise<void> {
    const sim = this.host.sim();
    const mapView = this.host.mapView();
    if (!sim || !mapView) return;
    const local = useGameStore.getState().localPlayerIndex;
    const attackerTile = this.tileOfUnitById(e.attackerId);
    const targetTile = tileAt(sim.map, e.targetTile.q, e.targetTile.r);
    const attackerVisible = attackerTile !== undefined && isExploredFor(attackerTile, local);
    const targetVisible = targetTile !== undefined && isExploredFor(targetTile, local);
    const audible = attackerVisible || targetVisible;
    if (audible) sfx.play('arcShot');
    let shot: Promise<void> | null = null;
    if (audible && attackerVisible && attackerTile !== undefined && targetTile !== undefined) {
      this.effects.spawnMuzzleSmokeAt(attackerTile);
      shot = this.effects.spawnCannonballFromTo(attackerTile, targetTile, true);
    }
    if (shot) await shot;
    if (!e.missed && targetVisible && targetTile !== undefined) {
      this.host.render();
      mapView.bounceHex(e.targetTile.q, e.targetTile.r);
    }
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
    if (attacker.type === UnitType.RIDER && canMove(attacker)) {
      store.setSelection({ kind: SelectionKind.UNIT, q: attacker.q, r: attacker.r });
      return;
    }
    if (attacker.type === UnitType.KNIGHT && canAttack(attacker)) {
      store.setSelection({ kind: SelectionKind.UNIT, q: attacker.q, r: attacker.r });
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
    facing: UnitFacing,
    impact?: AttackImpact,
    keep: Map<string, Unit> = new Map(),
    attackerShot: Promise<void> | null = null,
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
    // Wait for the attacker's projectile to land before the hit lands/counter
    // fires, so multi-tile shots and counter shots never overlap.
    if (attackerShot) await attackerShot;
    if (impact) sfx.play(impact);

    // Attacker's blow lands on the target first.
    if (e.attackerDamage > 0) {
      this.effects.spawnHpText(targetTile, `-${e.attackerDamage}`, 0xff4444);
      target.hp = Math.max(0, target.hp - e.attackerDamage);
      this.host.render();
    }

    // Then the target answers with its own attack animation when it deals
    // counter damage (sim: the target counters when it survives). Ranged
    // defenders (archers, ships, catapults) fire their own projectile back
    // once the initial attack animation has finished.
    if (e.targetDamage > 0) {
      const counterFacing: UnitFacing = facing === UnitFacing.LEFT ? UnitFacing.RIGHT : UnitFacing.LEFT;
      mapView.faceUnitAtKey(targetKey, counterFacing);
      const targetPre = e.targetPre!;
      if (targetPre.type === UnitType.ARCHER && targetPre.shipLevel === undefined) {
        await this.effects.spawnArrowFromTo(targetTile, attackerTile);
      } else if (targetPre.shipLevel !== undefined) {
        this.effects.spawnMuzzleSmokeAt(targetTile);
        await this.effects.spawnCannonballFromTo(targetTile, attackerTile, false);
      } else if (targetPre.type === UnitType.CATAPULT) {
        await this.effects.spawnCannonballFromTo(targetTile, attackerTile, true);
      } else if (targetPre.type === UnitType.PIRATE) {
        this.effects.spawnMuzzleSmokeAt(targetTile);
        await this.effects.spawnCannonballFromTo(targetTile, attackerTile, false);
      } else {
        await mapView.lungeUnit(targetKey, attackerKey, 10 / scale);
      }
      this.effects.spawnHpText(attackerTile, `-${e.targetDamage}`, 0xff4444);
      attacker.hp = Math.max(0, attacker.hp - e.targetDamage);
      this.host.render();
    }

    const attackerVisible = isExploredFor(attackerTile, local);
    if (e.targetDied && targetVisible) {
      this.effects.spawnDeath(targetTile);
      await sleep(COMBAT_DEATH_GAP_MS);
    }
    if (e.attackerDied && attackerVisible) {
      this.effects.spawnDeath(attackerTile);
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

  /** Kill-and-advance combat presentation: a melee attacker that killed its
   *  target and moves onto the vacated cell skips the lunge/strike animation
   *  and goes straight to the walk onto the target tile (the victim's -N text
   *  and death burst still play). */
  private async presentKillAdvance(
    e: Extract<GameEvent, { type: 'attack' }>,
    attackerTile: MapTile,
    targetTile: MapTile,
    targetVisible: boolean,
    facing: UnitFacing,
    keep: Map<string, Unit>,
  ): Promise<void> {
    const mapView = this.host.mapView();
    if (!mapView) return;
    const attackerKey = axialKey(attackerTile);
    const targetKey = axialKey(targetTile);
    const attacker = this.stageUnit(e.attackerPre!, e.attackerId, attackerTile.q, attackerTile.r);
    const staged = new Map<string, Unit | null>(keep);
    staged.set(attackerKey, attacker);
    staged.set(targetKey, null); // the victim is already dead in the final state
    mapView.setUnitOverrides(staged);
    mapView.faceUnitAtKey(attackerKey, facing);
    this.host.render();

    if (e.attackerDamage > 0 && targetVisible) this.effects.spawnHpText(targetTile, `-${e.attackerDamage}`, 0xff4444);
    if (targetVisible) this.effects.spawnDeath(targetTile);
    await sleep(COMBAT_DEATH_GAP_MS);

    // The walk onto the killed unit's cell is the only animation played.
    await mapView.slideUnit(attackerKey, targetKey, COMBAT_ADVANCE_MS);
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

    private makeMoveGhostSprite(unit: Unit, shipLevel: 1 | 2 | 3 | undefined, tile: MapTile): Sprite | null {
    const mapView = this.host.mapView();
    const textures = this.host.textures();
    if (!mapView || !textures || !this.host.app()) return null;
    const store = useGameStore.getState();
    const tribe = unit.owner >= 0 ? store.players[unit.owner]?.tribe : undefined;
    const unitTex =
      unit.type === UnitType.PIRATE
        ? textures.pirateTexture
        : shipLevel !== undefined && tribe !== undefined
          ? textures.shipTextures[tribe]?.[shipLevel]
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
    // A stealthed enemy stalker's move is never shown to anyone but its owner:
    // hide it entirely and just let the fog reveal happen. The sim already holds
    // the batch's final state, so a stalker spotted at the end of its walk has
    // `isStealthed` false here although it was hidden while moving.
    if (unit.owner !== local && this.stealthedMoves.has(e)) return;
    if (unit.owner !== local && unit.owner !== PIRATE_OWNER) {
      steps = steps.filter((s) => {
        const t = tileAt(map, s.q, s.r);
        return t !== undefined && isExploredFor(t, local);
      });
      if (steps.length === 0) return;
    }
    const store = useGameStore.getState();
    const tribe = store.players[unit.owner]?.tribe;
    const unitTex = unit.type === UnitType.PIRATE
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
    // Post-move attackable/reachable markers must not appear while the mover is
    // still sliding, so defer their reveal until the animation completes.
    const stepMs = unit.owner === local ? OWN_STEP_MS : ENEMY_STEP_MS;
    const stepGapMs = unit.owner === local ? OWN_STEP_GAP_MS : ENEMY_STEP_GAP_MS;
    mapView.deferNewMarkers(steps.length * (stepMs + stepGapMs) + 100);
    this.host.render();
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5, unitTex.anchorY);
    sprite.scale.set(this.host.camera().spriteScale);
    sprite.zIndex = 10;
    const startPos = hexToPixel(e.from, HEX_SIZE);
    const fromTile = tileAt(map, e.from.q, e.from.r);
    sprite.position.set(startPos.x, startPos.y - (fromTile ? tileElevation(fromTile, HEX_SIZE) : 0));
    mapView.container.addChild(sprite);
    const seaUnit = e.shipLevel !== undefined || unit.type === UnitType.PIRATE;
    let facing: UnitFacing = UnitFacing.RIGHT;
    let prev = e.from;
    for (const step of steps) {
      const to = hexToPixel(step, HEX_SIZE);
      const stepFacing: UnitFacing = to.x < hexToPixel(prev, HEX_SIZE).x ? UnitFacing.LEFT : UnitFacing.RIGHT;
      if (stepFacing !== facing) {
        facing = stepFacing;
        sprite.scale.x = -sprite.scale.x;
        mapView.setUnitFacing(unit.id, facing);
      }
      const targetTile = tileAt(map, step.q, step.r);
      const y = targetTile ? to.y - tileElevation(targetTile, HEX_SIZE) : to.y;
      await this.effects.tweenSpriteTo(sprite, { x: to.x, y }, stepMs);
      if (seaUnit) this.spawnShipWakeSegment(prev, step);
      prev = step;
      await sleep(stepGapMs);
    }
    this.host.hiddenUnitIds().delete(unit.id);
    mapView.container.removeChild(sprite);
    sprite.destroy();
    // Persist the final walk facing so the resting unit keeps looking along
    // its last travel direction (a purely rightward move overrides a previous
    // left-facing flip).
    mapView.setUnitFacing(unit.id, facing);
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
    if (e.kind === BonusKind.SKILL) {
      if (e.skill) store.setCenterMessage(t('msg.skillOpened', { skill: SKILLS[e.skill].name }));
      return;
    }
    const messages: Record<Exclude<BonusKind, 'skill'>, string> = {
      money: t('hud.selected.bonus.money'),
      resources: t('hud.selected.bonus.resources'),
      villageUpgrade: t('hud.selected.bonus.villageUpgrade'),
      explorer: t('hud.selected.bonus.explorer'),
    };
    store.setCenterMessage(t('msg.bonusPrefix', { text: messages[e.kind] }));
  }

  private presentBottleCollected(e: Extract<GameEvent, { type: 'bottleCollected' }>): void {
    const local = useGameStore.getState().localPlayerIndex;
    if (e.playerIndex !== local) return;
    const messages = {
      money: t('msg.bottleMoney'),
      skill: e.skill ? t('msg.bottleSkill', { skill: SKILLS[e.skill].name }) : t('msg.bottleMoney'),
      heal: t('msg.bottleHeal'),
    };
    useGameStore.getState().setCenterMessage(messages[e.kind]);
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
    const unitTex = textures.unitTextures[player.tribe]?.[UnitType.WARRIOR];
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
      await this.effects.tweenSpriteTo(sprite, { x: to.x, y }, 100);
      await sleep(100);
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
      this.effects.spawnFogReveal(tile);
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
      const tribe = tribeById(dead.tribe);
      if (tribe) useGameStore.getState().setCenterMessage(t('msg.tribeDied', { tribe: tribe.name }), `${tribe.code}-icon.png`);
    }
  }

  private async presentStalkerSpotted(e: Extract<GameEvent, { type: 'stalkerSpotted' }>): Promise<void> {
    const sim = this.host.sim();
    const village = sim ? tileAt(sim.map, e.villageQ, e.villageR) : undefined;
    const store = useGameStore.getState();
    this.host.render();
    if (village?.settlement?.owner === store.localPlayerIndex) {
      store.setCenterMessage(t('msg.stalkerInYourVillage'));
      await this.host.centerOnCell(e.villageQ, e.villageR);
      return;
    }
    const name = village?.settlement?.name ?? t('tile.Settlement');
    store.setCenterMessage(t('msg.stalkerSpotted', { village: name }));
  }

  private showCaptureMessage(village: MapTile, capturer: Player): void {
    const store = useGameStore.getState();
    const local = store.players[store.localPlayerIndex];
    const known = new Set<number>();
    if (local) {
      known.add(local.tribe);
      for (const t of local.knownTribes ?? []) known.add(t);
    }
    const tribe = tribeById(capturer.tribe);
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
    if (playerIndex === store.localPlayerIndex && store.netMode === NetMode.SINGLE) this.host.saveGame();
  }

  private presentGameOver(winnerIndex: number, bonus: number): void {
    const store = useGameStore.getState();
    store.setWinnerIndex(winnerIndex);
    store.setGameOver(true);
    store.setAiActive(false);
    store.setSelection(null);
    saveRepository.clear();
  }

  /** The HUD list of active weather follows what has been presented so far. */
  private syncWeatherStore(): void {
    const sim = this.host.sim();
    if (sim) useGameStore.getState().setWeather(weatherCopies(sim.map));
  }

  private async presentWeatherStarted(weather: WeatherEvent): Promise<void> {
    const sim = this.host.sim();
    if (!sim) return;
    this.syncWeatherStore();
    // The sim already holds the strike's outcome (fire, dead units): draw it
    // only after the bolt has played.
    if (weather.type !== WeatherType.LIGHTNING) this.host.render();
    const local = useGameStore.getState().localPlayerIndex;
    let shakeMs = 0;
    if (weather.type === WeatherType.LIGHTNING) {
      const strikeTile = tileAt(sim.map, weather.q, weather.r);
      if (strikeTile && isExploredFor(strikeTile, local)) {
        await this.host.centerOnCell(weather.q, weather.r);
        await this.effects.playLightning(strikeTile);
      }
      this.host.render();
    }
    if (weather.type === WeatherType.EARTHQUAKE) {
      // Bring the quake into view first, so the shake plays where the player looks.
      const centerTile = tileAt(sim.map, weather.q, weather.r);
      if (centerTile && isExploredFor(centerTile, local)) await this.host.centerOnCell(weather.q, weather.r);
      const visible = tilesInRange(weather, weather.radius).filter((c) => {
        const tile = tileAt(sim.map, c.q, c.r);
        return tile !== undefined && isExploredFor(tile, local);
      });
      shakeMs = this.host.mapView()?.shakeTiles(visible) ?? 0;
    }
    useGameStore.getState().setCenterMessage(
      t('weather.started', {
        name: t(`weather.${weather.type}` as never),
        where: t(`weather.where.${compassDirection(weather)}` as never),
      }),
    );
    // Messages queue in the store; only the shake has to play out first.
    if (shakeMs > 0) await sleep(shakeMs);
  }

  private async presentWeatherEnded(weather: WeatherEvent): Promise<void> {
    this.syncWeatherStore();
    this.host.render();
    // A one-turn event (the earthquake) is over before anyone could read it.
    if (weather.lifetime <= 1) return;
    useGameStore.getState().setCenterMessage(t(`weather.ended.${weather.type}` as never));
  }

  private async presentWeatherDamage(units: WeatherUnitHit[], buildings: WeatherBuildingHit[]): Promise<void> {
    const sim = this.host.sim();
    if (!sim) return;
    this.host.render();
    const local = useGameStore.getState().localPlayerIndex;
    let burst = false;
    for (const hit of units) {
      const tile = tileAt(sim.map, hit.q, hit.r);
      if (!tile || !isExploredFor(tile, local)) continue;
      this.effects.spawnHpText(tile, `-${hit.damage}`, 0xff4d4d);
      if (hit.died) {
        this.effects.spawnDeath(tile);
        burst = true;
      }
    }
    for (const hit of buildings) {
      const tile = tileAt(sim.map, hit.q, hit.r);
      if (tile) this.effects.spawnHpText(tile, '-1', 0xffa040);
    }
    if (burst) await sleep(COMBAT_DEATH_GAP_MS);
  }

}
