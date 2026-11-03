import { StarField } from '../../gfx/star-field';
import { Container, Graphics } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { type OverlayState, useGameStore } from '../../store/game-store';
import { t } from '../../i18n';
import { advanceCheatBuffer, triggeredCheat, SKILLS_CHEAT_WORD, RESOURCE_CHEAT_WORD, FOG_CHEAT_WORD, PIRATES_CHEAT_WORD, WIN_CHEAT_WORD, SEASON_CHEAT_WORDS, WEATHER_CHEAT_WORDS } from '../../game/cheats';
import { type ScreenController, type UIHost, type Widget } from '../host';
import { HudScore } from '../hud/hud-score';
import { HudPlayers } from '../hud/hud-players';
import { HudLoading } from '../hud/hud-loading';
import { HudSeason } from '../hud/hud-season';
import { HudWeather } from '../hud/hud-weather';
import { HudTurn } from '../hud/hud-turn';
import { HudResourcePanel } from '../hud/hud-resource-panel';
import { HudSelected } from '../hud/hud-selected';
import { HudAchievements } from '../hud/hud-achievements';
import { HudHelp } from '../hud/hud-help';
import { HudTrade } from '../hud/hud-trade';
import { HudContextMenu } from '../hud/hud-context-menu';
import { HudToolbar } from '../hud/hud-toolbar';
import { HudWatchExit } from '../hud/hud-watch-exit';
import { HudPerf } from '../hud/hud-perf';
import { HudScrim } from '../hud/hud-scrim';
import { OverlayKind, ScrimSide, Season, WeatherType } from '@enums';

/** The score HUD: tapping the player's chip opens the stats popup. */
function scoreHud(): HudScore {
  const hud = new HudScore();
  hud.onTap = () => useGameStore.getState().setOverlay({ kind: OverlayKind.STATS });
  return hud;
}

/** Screen direction each arrow key selects toward. */
/** Keys that toggle a popup, with or without Shift. */
const TOGGLE_OVERLAYS: Record<string, OverlayKind.SKILL | OverlayKind.ACHIEVEMENTS | OverlayKind.HELP> = {
  KeyS: OverlayKind.SKILL,
  KeyA: OverlayKind.ACHIEVEMENTS,
  KeyH: OverlayKind.HELP,
};

const ARROW_DIRECTIONS: Record<string, { dx: number; dy: number }> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
};

export class GameScreen implements ScreenController {
  private root: Container | null = null;
  private mapLayer: Container | null = null;
  private stars: StarField | null = null;
  private mapMask: Graphics | null = null;
  private hud: Container | null = null;
  /** Everything shown once the game has loaded: map + HUD widgets. */
  private content: Container | null = null;
  private widgets: Widget[] = [];
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private cheatBuffer = '';

  /** Hotkeys: Ctrl+Enter ends the turn, Enter / Space start target selection, S / A / H toggle skills / achievements / help (Shift optional),
   *  arrows select the nearest own unit that way. Returns true when handled. */
  private handleHotkey(e: KeyboardEvent): boolean {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return false;
    const store = useGameStore.getState();
    const toggled = !e.ctrlKey && !e.metaKey && !e.altKey ? TOGGLE_OVERLAYS[e.code] : undefined;
    if (toggled !== undefined && !e.repeat && !store.texturesLoading && (store.overlay === null || store.overlay.kind === toggled)) {
      store.setOverlay(store.overlay === null ? ({ kind: toggled } as OverlayState) : null);
      return true;
    }
    if (store.overlay !== null || store.texturesLoading) return false;
    const arrow = ARROW_DIRECTIONS[e.key];
    if (e.code === 'Space' && !e.repeat) {
      gameController.toggleKeyTargeting();
      return true;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.repeat) {
      gameController.endTurn();
      return true;
    }
    if (arrow && e.shiftKey) {
      gameController.selectAdjacentTile(arrow.dx, arrow.dy);
      return true;
    }
    if (arrow && !e.shiftKey && gameController.isKeyTargeting) {
      gameController.moveKeyTarget(arrow.dx, arrow.dy);
      return true;
    }
    if (e.key === 'Enter' && !e.shiftKey && gameController.isKeyTargeting) {
      if (!e.repeat) gameController.confirmKeyTarget();
      return true;
    }
    if (arrow && !e.shiftKey) {
      gameController.selectUnitInDirection(arrow.dx, arrow.dy);
      return true;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.repeat) {
      gameController.toggleKeyTargeting();
      return true;
    }
    return false;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if ((e.ctrlKey || e.metaKey) && e.key !== 'Enter') return;
    if (e.altKey) return;
    // Letters feed the cheat buffer even when a letter hotkey (S / A / H) takes them.
    const typedLetter = !e.shiftKey && e.key.length === 1 && /[a-z]/i.test(e.key);
    if (typedLetter) this.cheatBuffer = advanceCheatBuffer(this.cheatBuffer, e.key);
    const handled = this.handleHotkey(e);
    if (handled) e.preventDefault();
    const cheat = typedLetter ? triggeredCheat(this.cheatBuffer) : null;
    if (!cheat) return;
    this.cheatBuffer = '';
    // The cheat word may have toggled a hotkey popup on the way; close it.
    const store = useGameStore.getState();
    if (store.overlay && (Object.values(TOGGLE_OVERLAYS) as OverlayKind[]).includes(store.overlay.kind)) store.setOverlay(null);
    if (cheat === RESOURCE_CHEAT_WORD && gameController.cheats.cheatResources()) {
      useGameStore.getState().setCenterMessage(t('msg.cheatResources'));
    } else if (cheat === SKILLS_CHEAT_WORD && gameController.cheats.cheatOpenAllSkills()) {
      useGameStore.getState().setCenterMessage(t('msg.cheatSkills'));
    } else if (cheat === FOG_CHEAT_WORD && gameController.cheats.cheatRemoveFog()) {
      useGameStore.getState().setCenterMessage(t('msg.cheatFog'));
    } else if (cheat === PIRATES_CHEAT_WORD && gameController.cheats.cheatSpawnPirates()) {
      useGameStore.getState().setCenterMessage(t('msg.cheatPirates'));
    } else if (cheat === WIN_CHEAT_WORD && gameController.cheats.cheatWin()) {
      useGameStore.getState().setCenterMessage(t('msg.cheatWin'));
    } else if ((SEASON_CHEAT_WORDS as readonly string[]).includes(cheat)) {
      void gameController.cheats.cheatSetSeason(cheat as Season);
    } else if (WEATHER_CHEAT_WORDS.includes(cheat)) {
      void gameController.cheats.cheatStartWeather(cheat as WeatherType);
    }
  };

  mount(host: UIHost): void {
    this.host = host;
    this.root = new Container();
    this.mapLayer = new Container();
    const mask = new Graphics();
    mask.eventMode = 'none';
    this.mapLayer.mask = mask;
    this.mapLayer.addChild(mask);
    this.mapMask = mask;
    this.hud = new Container();
    const content = new Container();
    this.hud.addChild(content);
    const loading = new Container();
    this.hud.addChild(loading);
    this.content = content;
    this.root.addChild(this.mapLayer, this.hud);
    // Stars sit below the whole game root, so the map overlays them.
    this.stars = new StarField(host.app, () => gameController.cameraPan());
    host.screenLayer.addChild(this.stars.el, this.root);
    gameController.init(host.app, this.mapLayer!, host.overlayLayer);

    const gameWidgets: Widget[] = [
      new HudScrim({ side: ScrimSide.TOP }),
      new HudScrim({ side: ScrimSide.BOTTOM }),
      scoreHud(),
      new HudPlayers(),
      new HudTurn(),
      new HudSeason(),
      new HudWeather(),
      new HudWatchExit(),
      new HudResourcePanel(),
      new HudSelected(),
      new HudAchievements(),
      new HudTrade(),
      new HudHelp(),
      new HudToolbar(),
      new HudContextMenu(),
      new HudPerf(),
    ];
    for (const w of gameWidgets) w.mount(host, content);
    const hudLoading = new HudLoading();
    hudLoading.mount(host, loading);
    this.widgets = [...gameWidgets, hudLoading];

    this.applyLoading();
    this.unsub = useGameStore.subscribe(() => this.applyLoading());
    this.layoutMask();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
  }

  /** While textures load, hide the map and every HUD widget so only the
   * loading label (owned by HudLoading) is visible. */
  private applyLoading(): void {
    if (!this.host) return;
    const loading = useGameStore.getState().texturesLoading;
    this.stars?.setLoading(loading);
    if (this.mapLayer) this.mapLayer.visible = !loading;
    if (this.content) this.content.visible = !loading;
  }

  private onResize = (): void => {
    gameController.handleResize();
    this.layoutMask();
  };

  private layoutMask(): void {
    if (!this.mapMask || !this.host) return;
    // The map always covers the full screen height (including under the
    // toolbar), regardless of screen width.
    this.mapMask.clear().rect(0, 0, this.host.app.screen.width, this.host.app.screen.height).fill(0xffffff);
  }

  destroy(): void {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    if (this.unsub) this.unsub();
    this.unsub = null;
    gameController.shutdown();
    for (const w of this.widgets) w.destroy();
    this.widgets = [];
    this.stars?.destroy();
    this.stars = null;
    this.root?.destroy({ children: true });
    this.root = null;
    this.mapLayer = null;
    this.mapMask = null;
    this.hud = null;
    this.content = null;
    this.host = null;
  }
}
