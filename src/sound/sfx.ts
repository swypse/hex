import { soundEnabled } from '../storage/settings';

const FILES: Record<string, string> = {
  click: 'click.wav',
  claim: 'claim.wav',
  hit: 'hit.wav',
  upgrade: 'upgrade.wav',
};

const cache = new Map<string, HTMLAudioElement>();

export function soundUrl(name: string): string | null {
  const file = FILES[name];
  if (!file) return null;
  return `${import.meta.env.BASE_URL}sounds/${file}`;
}

export function play(name: string): void {
  if (typeof Audio === 'undefined') return;
  if (!soundEnabled()) return;
  const url = soundUrl(name);
  if (!url) return;
  let el = cache.get(name);
  if (!el) {
    el = new Audio(url);
    cache.set(name, el);
  }
  el.pause();
  el.currentTime = 0;
  const p = el.play();
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

export const sfx = { play, soundUrl };
