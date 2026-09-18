import { Application, Container, Graphics, Text } from 'pixi.js';
import { t } from './i18n';

const TOAST_LIFETIME_MS = 3000;
const TOAST_FADE_MS = 180;
const TOAST_COOLDOWN_MS = 5000;
const TOAST_MARGIN = 16;
const TOAST_MAX_WIDTH = 420;
const TOAST_PAD = 10;

let appRef: Application | null = null;
let lastToastAt = 0;

function showToast(): void {
  const app = appRef;
  if (!app) return;
  const now = performance.now();
  if (now - lastToastAt < TOAST_COOLDOWN_MS) return;
  lastToastAt = now;

  const root = new Container();
  const text = new Text({
    text: t('error.toast'),
    style: {
      fontFamily: 'Roboto, system-ui, sans-serif',
      fontSize: 15,
      fill: 0xeeeeee,
      wordWrap: true,
      wordWrapWidth: TOAST_MAX_WIDTH - TOAST_PAD * 2,
    },
  });
  const bgH = text.height + TOAST_PAD * 2;
  const bgW = text.width + TOAST_PAD * 2;
  const bg = new Graphics();
  bg.roundRect(0, 0, bgW, bgH, 8);
  bg.fill({ color: 0x1a1a2e, alpha: 0.92 });
  bg.stroke({ width: 1, color: 0xff8c00, alpha: 0.7 });
  root.addChild(bg);
  text.position.set(TOAST_PAD, TOAST_PAD);
  root.addChild(text);
  root.position.set((app.screen.width - bgW) / 2, TOAST_MARGIN);
  root.alpha = 0;
  app.stage.addChild(root);

  let elapsed = 0;
  const tick = (ticker: { deltaMS: number }): void => {
    elapsed += ticker.deltaMS;
    if (elapsed < TOAST_FADE_MS) {
      root.alpha = elapsed / TOAST_FADE_MS;
    } else if (elapsed > TOAST_LIFETIME_MS - TOAST_FADE_MS) {
      root.alpha = Math.max(0, (TOAST_LIFETIME_MS - elapsed) / TOAST_FADE_MS);
    } else {
      root.alpha = 1;
    }
    if (elapsed >= TOAST_LIFETIME_MS) {
      app.ticker.remove(tick);
      root.destroy({ children: true });
    }
  };
  app.ticker.add(tick);
}

function report(message: string, source: string, line: number, error: unknown): void {
  const stack = error instanceof Error && error.stack ? error.stack : null;
  if (stack) {
    console.error('[hex] unhandled error:\n', stack);
  } else {
    const where = source ? ` ${source}:${line}` : '';
    console.error('[hex] unhandled error:', message, where);
  }
  showToast();
}

export function initErrorReporter(app: Application): void {
  appRef = app;
  window.addEventListener('error', (event) => {
    report(event.message, event.filename ?? '', event.lineno ?? 0, event.error ?? null);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const err = reason instanceof Error ? reason : null;
    report(err ? err.message : String(reason), '', 0, err ?? reason);
  });
}