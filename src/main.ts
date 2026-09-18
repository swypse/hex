import { Application } from 'pixi.js';
import { initNavigation, useGameStore } from './store/game-store';
import { readJoinCode, setPendingJoin } from './net/join-link';
import { ScreenManager } from './ui/screen-manager';
import { gameController } from './controller/game-controller';
import { loadBitmapFonts } from './ui/kit/bitmap-fonts';
import { preventCanvasContextMenu } from './prevent-canvas-context-menu';
import { initErrorReporter } from './error-reporter';

function preventBrowserZoom(): void {
  window.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey) e.preventDefault();
    },
    { passive: false },
  );
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
      e.preventDefault();
    }
  });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
}

async function boot(): Promise<void> {
  preventBrowserZoom();
  await Promise.all([
    document.fonts.load('16px "Roboto"'),
    document.fonts.load('800 16px "Roboto"'),
  ]);
  await loadBitmapFonts();
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: '#1a1a2e',
    antialias: true,
    resolution: window.devicePixelRatio,
    autoDensity: true,
    preference: 'webgpu',
  });
  document.getElementById('root')!.appendChild(app.canvas);
  // Global error/unhandled-rejection reporting + in-game notice.
  initErrorReporter(app);
  // Long-press (mobile) and right-click (desktop) on the canvas would otherwise
  // open the browser's "Save image as…" context menu.
  preventCanvasContextMenu(app.canvas);
  // Mobile browsers drop the WebGL context while the tab is backgrounded, which
  // blanks every generateTexture() sprite. Pixi restores its own GL state, so
  // rebuild the generated textures once the context is usable again.
  app.canvas.addEventListener('webglcontextrestored', () => {
    void gameController.recoverFromContextLoss();
  });
  // A ?join=<code> link opens straight into the multiplayer join screen.
  const joinCode = readJoinCode();
  if (joinCode) {
    setPendingJoin(joinCode);
    useGameStore.getState().setScreen('lobby');
  }
  new ScreenManager(app);
  initNavigation();
}

void boot();
