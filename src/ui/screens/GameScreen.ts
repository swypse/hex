import { Container, Graphics } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { useGameStore } from '../../store/gameStore';
import { t } from '../../i18n';
import { advanceCheatBuffer, triggeredCheat, SKILLS_CHEAT_WORD, RESOURCE_CHEAT_WORD, FOG_CHEAT_WORD, PIRATES_CHEAT_WORD, AI_LOGS_CHEAT_WORD } from '../../game/cheats';
import { type ScreenController, type UIHost, type Widget } from '../host';
import { HudScore } from '../hud/HudScore';
import { HudPlayers } from '../hud/HudPlayers';
import { HudLoading } from '../hud/HudLoading';
import { HudTurn } from '../hud/HudTurn';
import { HudMoney } from '../hud/HudMoney';
import { HudSelected } from '../hud/HudSelected';
import { HudSkills } from '../hud/HudSkills';
import { HudAchievements } from '../hud/HudAchievements';
import { HudToolbar } from '../hud/HudToolbar';
import { HudTips } from '../hud/HudTips';
import { HudTribes } from '../hud/HudTribes';
import { TOOLBAR_HEIGHT, isWideScreen } from '../layout';

export class GameScreen implements ScreenController {
  private root: Container | null = null;
  private mapLayer: Container | null = null;
  private mapMask: Graphics | null = null;
  private hud: Container | null = null;
  /** Everything shown once the game has loaded: map + HUD widgets. */
  private content: Container | null = null;
  private widgets: Widget[] = [];
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private cheatBuffer = '';

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length !== 1) return;
    if (!/[a-z]/i.test(e.key)) return;
    this.cheatBuffer = advanceCheatBuffer(this.cheatBuffer, e.key);
    const cheat = triggeredCheat(this.cheatBuffer);
    if (!cheat) return;
    this.cheatBuffer = '';
    if (cheat === RESOURCE_CHEAT_WORD && gameController.cheatResources()) {
      useGameStore.getState().setCenterMessage(t('msg.cheatResources'));
    } else if (cheat === SKILLS_CHEAT_WORD && gameController.cheatOpenAllSkills()) {
      useGameStore.getState().setCenterMessage(t('msg.cheatSkills'));
    } else if (cheat === FOG_CHEAT_WORD && gameController.cheatRemoveFog()) {
      useGameStore.getState().setCenterMessage(t('msg.cheatFog'));
    } else if (cheat === PIRATES_CHEAT_WORD && gameController.cheatSpawnPirates()) {
      useGameStore.getState().setCenterMessage(t('msg.cheatPirates'));
    } else if (cheat === AI_LOGS_CHEAT_WORD) {
      const on = gameController.cheatToggleAiLogs();
      useGameStore.getState().setCenterMessage(on ? t('msg.aiLogsOn') : t('msg.aiLogsOff'));
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
    host.screenLayer.addChild(this.root);
    gameController.init(host.app, this.mapLayer!, host.overlayLayer);

    const gameWidgets: Widget[] = [
      new HudScore(),
      new HudPlayers(),
      new HudTurn(),
      new HudMoney(),
      new HudTribes(),
      new HudSelected(),
      new HudSkills(),
      new HudAchievements(),
      new HudToolbar(),
      new HudTips(),
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
    if (this.mapLayer) this.mapLayer.visible = !loading;
    if (this.content) this.content.visible = !loading;
  }

  private onResize = (): void => {
    gameController.handleResize();
    this.layoutMask();
  };

  private layoutMask(): void {
    if (!this.mapMask || !this.host) return;
    const height = isWideScreen(this.host.app.screen.width)
      ? this.host.app.screen.height
      : this.host.app.screen.height - TOOLBAR_HEIGHT;
    this.mapMask.clear().rect(0, 0, this.host.app.screen.width, height).fill(0xffffff);
  }

  destroy(): void {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    if (this.unsub) this.unsub();
    this.unsub = null;
    gameController.shutdown();
    for (const w of this.widgets) w.destroy();
    this.widgets = [];
    this.root?.destroy({ children: true });
    this.root = null;
    this.mapLayer = null;
    this.mapMask = null;
    this.hud = null;
    this.content = null;
    this.host = null;
  }
}
