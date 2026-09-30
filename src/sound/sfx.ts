import { soundEnabled } from '../storage/settings';

const FILES: Record<string, string> = {
  click: 'click.wav',
  claim: 'claim.wav',
  hit: 'hit.wav',
  arcShot: 'bow-shot.wav',
  swordHit: 'sword-hit.wav',
  waterSplash: 'water-splash.wav',
  waterSquish: 'water-squish.wav',
  spawn: 'spawn.wav',
  upgrade: 'upgrade.wav',
};

const cache = new Map<string, HTMLAudioElement>();

// Web Audio path: every sound is fetched and decoded up front, so playing one
// just starts a buffer (no per-play element setup, no seek, no network). The
// HTMLAudio path below stays as the fallback until a buffer is ready or when
// the API is missing.
let ctx: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();
let preloaded = false;

function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = typeof window !== 'undefined'
    ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    : undefined;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

export function soundUrl(name: string): string | null {
  const file = FILES[name];
  if (!file) return null;
  return `${import.meta.env.BASE_URL}sounds/${file}`;
}

/** Fetches and decodes every sound, and unlocks the audio context on the first
 *  user gesture (browsers keep it suspended until then). Safe to call twice. */
export function preload(): void {
  if (preloaded) return;
  preloaded = true;
  const c = audioContext();
  if (!c || typeof fetch === 'undefined') return;
  for (const name of Object.keys(FILES)) {
    const url = soundUrl(name)!;
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((data) => c.decodeAudioData(data))
      .then((buf) => {
        buffers.set(name, buf);
      })
      .catch(() => {});
  }
  const unlock = (): void => {
    if (c.state === 'suspended') void c.resume().catch(() => {});
    if (c.state === 'running') {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    }
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}

function playBuffer(name: string): boolean {
  const c = ctx;
  const buf = buffers.get(name);
  if (!c || !buf) return false;
  if (c.state === 'suspended') void c.resume().catch(() => {});
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(c.destination);
  src.start();
  return true;
}

export function play(name: string): void {
  if (!soundEnabled()) return;
  if (!soundUrl(name)) return;
  if (playBuffer(name)) return;
  if (typeof Audio === 'undefined') return;
  const url = soundUrl(name)!;
  let el = cache.get(name);
  if (!el) {
    el = new Audio(url);
    el.preload = 'auto';
    cache.set(name, el);
  }
  el.pause();
  el.currentTime = 0;
  const p = el.play();
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

export const sfx = { play, soundUrl, preload };
