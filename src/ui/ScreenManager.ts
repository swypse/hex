import { Application, Container } from 'pixi.js';
import { useGameStore, type Screen } from '../store/gameStore';
import { type ScreenController, type UIHost } from './host';
import { StartScreen } from './screens/StartScreen';
import { SetupScreen } from './screens/SetupScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { GameScreen } from './screens/GameScreen';
import { OverlayManager } from './overlays/OverlayManager';

const SCREENS: Record<Screen, new () => ScreenController> = {
  start: StartScreen,
  setup: SetupScreen,
  lobby: LobbyScreen,
  game: GameScreen,
};

export class ScreenManager implements UIHost {
  readonly app: Application;
  readonly screenLayer: Container;
  readonly overlayLayer: Container;
  private current: ScreenController | null = null;
  private readonly unsub: () => void;
  private readonly overlays: OverlayManager;

  constructor(app: Application) {
    this.app = app;
    app.stage.sortableChildren = true;
    this.screenLayer = new Container();
    this.screenLayer.zIndex = 1;
    this.overlayLayer = new Container();
    this.overlayLayer.zIndex = 2;
    app.stage.addChild(this.screenLayer);
    app.stage.addChild(this.overlayLayer);
    this.overlays = new OverlayManager(this);
    this.unsub = useGameStore.subscribe((state, prev) => {
      if (state.screen !== prev.screen) this.switchTo(state.screen);
    });
    this.switchTo(useGameStore.getState().screen);
  }

  private switchTo(screen: Screen): void {
    if (this.current) {
      this.current.destroy();
      this.screenLayer.removeChildren();
    }
    const ctor = SCREENS[screen];
    this.current = new ctor();
    this.current.mount(this);
  }

  destroy(): void {
    this.unsub();
    this.current?.destroy();
    this.overlays.destroy();
  }
}
