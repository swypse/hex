import { GameEventType, Season, WeatherType } from '@enums';
import { type GameEvent } from './events';
import { freezeCoast, thawIce } from './map/ice';
import type { GameMap } from './map/map-gen';
import { seasonForTurn } from './season';
import { activeWeather, advanceWeather, createWeather, spawnLightning, spawnWeather, WEATHER_RULES, type WeatherEvent } from './weather/weather';
import { applyFireTurn, applyLightning } from './weather/fire';
import { applyEarthquake, applyStormTurn } from './weather/weather-effects';

import type { SimContext } from './sim-context';

/** Seasons and weather: coast ice, storm damage, event spawning and announcements. */
export class Environment {
  constructor(private readonly ctx: SimContext) {}

  private get map(): GameMap {
    return this.ctx.map;
  }

  private get turn(): number {
    return this.ctx.turn;
  }

  private get rng(): () => number {
    return this.ctx.rng;
  }

  private emit(e: GameEvent): void {
    this.ctx.emit(e);
  }

  /** Round-end damage of the storms active during the turn that is ending, then the fires. */
  applyWeatherEffects(): void {
    for (const storm of activeWeather(this.map)) {
      if (storm.type !== WeatherType.STORM) continue;
      const report = applyStormTurn(this.map, storm);
      if (report.units.length > 0 || report.buildings.length > 0) {
        this.emit({ type: GameEventType.WEATHER_DAMAGE, weather: { ...storm }, ...report });
      }
    }
    const fire = applyFireTurn(this.map, this.rng);
    if (fire.units.length > 0 || fire.buildings.length > 0 || fire.ignited.length > 0 || fire.burnedOut.length > 0) {
      this.emit({ type: GameEventType.FIRE_TURN, ...fire });
    }
  }

  private announceWeather(born: WeatherEvent): void {
    this.emit({ type: GameEventType.WEATHER_STARTED, weather: { ...born } });
    if (born.type !== WeatherType.EARTHQUAKE && born.type !== WeatherType.LIGHTNING) return;
    const report = born.type === WeatherType.LIGHTNING ? applyLightning(this.map, born, this.rng) : applyEarthquake(this.map, born, this.rng);
    if (report.units.length > 0 || report.buildings.length > 0) {
      this.emit({ type: GameEventType.WEATHER_DAMAGE, weather: { ...born }, ...report });
    }
  }

  /** Once the turn counter has advanced: events age and expire, storms drift,
   *  and the periodic spawn attempt may bring a new event (an earthquake strikes
   *  at once). */
  advanceWeatherEvents(): void {
    const { ended, moved } = advanceWeather(this.map, this.rng);
    for (const weather of ended) this.emit({ type: GameEventType.WEATHER_ENDED, weather: { ...weather } });
    for (const weather of moved) this.emit({ type: GameEventType.WEATHER_MOVED, weather: { ...weather } });
    const born = spawnWeather(this.map, this.turn, this.rng);
    if (born) this.announceWeather(born);
    const strike = spawnLightning(this.map, this.turn, this.rng);
    if (strike) this.announceWeather(strike);
  }

  /** On entering winter coast water freezes; on leaving it the ice melts. */
  applySeasonChange(prev: Season = seasonForTurn(this.turn - 1)): void {
    const season = seasonForTurn(this.turn);
    this.map.season = season;
    if (season === prev) return;
    if (season === Season.WINTER) {
      const r = freezeCoast(this.map);
      this.emit({
        type: GameEventType.SEASON_CHANGED,
        season,
        frozen: r.frozen,
        thawed: [],
        landed: r.landed,
        removed: r.removed,
        killed: []
      });
    } else if (prev === Season.WINTER) {
      const r = thawIce(this.map);
      this.emit({
        type: GameEventType.SEASON_CHANGED,
        season,
        frozen: [],
        thawed: r.thawed,
        landed: [],
        removed: [],
        killed: r.killed
      });
    } else {
      this.emit({ type: GameEventType.SEASON_CHANGED, season, frozen: [], thawed: [], landed: [], removed: [], killed: [] });
    }
  }

  /** Cheat: starts a `type` event right now, ignoring the schedule and the
   *  chance; with the maximum already active the oldest one is ended first.
   *  Returns false when the map has no valid place for it. */
  forceWeather(type: WeatherType): boolean {
    const active = activeWeather(this.map);
    if (active.length >= WEATHER_RULES.maxActive) {
      const [oldest] = active.splice(0, 1);
      this.emit({ type: GameEventType.WEATHER_ENDED, weather: { ...oldest! } });
    }
    const born = createWeather(this.map, type, this.turn, this.rng);
    if (!born) return false;
    this.announceWeather(born);
    return true;
  }
}
