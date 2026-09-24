import { Application } from 'pixi.js';
import { initNavigation, useGameStore } from './store/game-store';
import { readJoinCode, setPendingJoin } from './net/join-link';
import { ScreenManager } from './ui/screen-manager';
import { gameController } from './controller/game-controller';
import { loadBitmapFonts } from './ui/kit/bitmap-fonts';
import { preventCanvasContextMenu } from './prevent-canvas-context-menu';
import { initErrorReporter } from './error-reporter';
import { installRenderGate, markDirty } from './render/render-gate';

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

/** The WebGPU device's preferred canvas texture format (e.g. 'rgba8unorm').
 *  Configuring the app's root canvas to this format avoids a per-frame
 *  format-conversion copy in the render target. Same API Pixi uses internally;
 *  falls back to undefined where WebGPU is unavailable. */
function preferredCanvasFormat(): string | undefined {
  try {
    const gpu = (navigator as { gpu?: { getPreferredCanvasFormat?: () => string } }).gpu;
    return gpu?.getPreferredCanvasFormat?.();
  } catch {
    return undefined;
  }
}

async function boot(): Promise<void> {
  preventBrowserZoom();
  await Promise.all([
    document.fonts.load('16px "Roboto"'),
    document.fonts.load('800 16px "Roboto"'),
  ]);
  await loadBitmapFonts();
  const app = new Application();
  const format = preferredCanvasFormat();
  await app.init({
    resizeTo: window,
    background: '#1a1a2e',
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    preference: 'webgl',
    // preference: 'webgpu',
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
    useGameStore.getState().setScreen('lobby');
  }
  new ScreenManager(app);
  initNavigation();
}

void boot();
