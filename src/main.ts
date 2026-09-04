import { Application } from 'pixi.js';
import { initNavigation, useGameStore } from './store/gameStore';
import { readJoinCode, setPendingJoin } from './net/joinLink';
import { ScreenManager } from './ui/ScreenManager';
import { gameController } from './controller/gameController';

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
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: '#1a1a2e',
    antialias: true,
    resolution: window.devicePixelRatio,
    autoDensity: true,
  });
  document.getElementById('root')!.appendChild(app.canvas);
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
