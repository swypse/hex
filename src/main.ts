import { Application } from 'pixi.js';
import { gameController } from './controller/game-controller';
import { initErrorReporter } from './error-reporter';
import { readJoinCode, setPendingJoin } from './net/join-link';
import { preventCanvasContextMenu } from './prevent-canvas-context-menu';
import { installRenderGate, markDirty } from './render/render-gate';
import { sfx } from './sound/sfx';
import { initNavigation, useGameStore } from './store/game-store';
import { THEME } from './ui/kit/theme';
import { preloadStartupWork } from './controller/startup-preload';
import { ScreenManager } from './ui/screen-manager';
import { preferredCanvasFormat, preventBrowserZoom } from './util';
import { loadFonts } from './util/load-fonts';
import { Screen } from '@enums';

async function boot(): Promise<void> {
  preventBrowserZoom();
  await loadFonts();
  sfx.preload();
  const app = new Application();
  const format = preferredCanvasFormat();
  await app.init({
    resizeTo: window,
    background: THEME.bg,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    preference: ['webgpu', 'webgl'],
    ...(format ? { format } : {}),
  });
  document.getElementById('root')!.appendChild(app.canvas);
  // Global error/unhandled-rejection reporting + in-game notice.
  initErrorReporter(app);
  // Skip `renderer.render` while the scene is static; frames run on demand via
  // `markDirty` (interactions, camera, animations).
  installRenderGate(app);
  // Any store change (HUD value, message, overlay, selection…) needs one frame.
  useGameStore.subscribe(() => markDirty());
  // Long-press (mobile) and right-click (desktop) on the canvas would otherwise
  // open the browser's "Save image as…" context menu.
  preventCanvasContextMenu(app.canvas);
  // Mobile browsers drop the WebGL context while the tab is backgrounded, which
  // blanks every generateTexture() sprite. Pixi restores its own GL state, so
  // rebuild the generated textures once the context is usable again.
  app.canvas.addEventListener('webglcontextlost', () => {
    gameController.noteContextLost();
  });
  app.canvas.addEventListener('webglcontextrestored', () => {
    void gameController.recoverFromContextLoss();
  });
  // Some mobile browsers (notably iOS Safari) drop the context during a long
  // background without reliably firing `webglcontextrestored` on return. Rebuild
  // the generated textures whenever the page becomes visible and the context
  // was lost. Recovery is idempotent and refuses to run twice.
  const recoverOnForeground = (): void => {
    if (document.visibilityState === 'visible') gameController.recoverOnForeground();
  };
  document.addEventListener('visibilitychange', recoverOnForeground);
  window.addEventListener('pageshow', recoverOnForeground);
  // A ?join=<code> link opens straight into the multiplayer join screen.
  const joinCode = readJoinCode();
  if (joinCode) {
    setPendingJoin(joinCode);
    useGameStore.getState().setScreen(Screen.LOBBY);
  }
  new ScreenManager(app);
  initNavigation();
  // The start screen is up: use its idle time to prepare what a game needs.
  void preloadStartupWork();
}

void boot();
