import { Rectangle, Texture } from 'pixi.js';
import { ensureCanvasResource } from './image-texture';

const TEXTURE_BASE = `${import.meta.env.BASE_URL}textures/`;

/** A frame in a packed atlas; `w`/`h` fall back to the atlas `cell` size. */
interface AtlasFrame {
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export interface AtlasSpec {
  /** Atlas image file under `textures/`. */
  file: string;
  frames: Record<string, AtlasFrame>;
  /** Frame size for frames that have no `w`/`h`. */
  cell?: number;
  /** Prefix for load error logs. */
  tag: string;
}

export interface Atlas {
  /** Loads the atlas image once; every caller shares the same promise. A
   *  failed load resolves without a texture so callers fall back to drawn art. */
  ensure(): Promise<void>;
  /** The slice for a frame key; null while the atlas is not loaded or the key is unknown. */
  frameTexture(key: string): Texture | null;
  /** Runs `fn` synchronously once the image has loaded (or failed), or right
   *  away when it already has; starts loading when needed. */
  whenLoaded(fn: () => void): void;
  readonly isLoaded: boolean;
}

/** A lazily loaded packed atlas with cached per-frame texture slices. */
export function createAtlas(spec: AtlasSpec): Atlas {
  const url = TEXTURE_BASE + spec.file;
  let texture: Texture | null = null;
  let promise: Promise<void> | null = null;
  let done = false;
  const waiting: Array<() => void> = [];
  const cache = new Map<string, Texture>();

  function finish(resolve: () => void): void {
    done = true;
    for (const fn of waiting.splice(0)) fn();
    resolve();
  }

  function ensure(): Promise<void> {
    if (promise) return promise;
    promise = new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          texture = Texture.from(img);
          ensureCanvasResource(texture);
        } catch {
          console.error(`[${spec.tag}] Texture.from failed for`, url);
        }
        finish(resolve);
      };
      img.onerror = () => {
        console.error(`[${spec.tag}] onerror for`, url);
        finish(resolve);
      };
      img.src = url;
    });
    return promise;
  }

  return {
    ensure,
    get isLoaded() {
      return done;
    },
    frameTexture(key) {
      const frame = spec.frames[key];
      if (!frame || !texture) return null;
      const cached = cache.get(key);
      if (cached) return cached;
      const tex = new Texture({
        source: texture.source,
        frame: new Rectangle(frame.x, frame.y, frame.w ?? spec.cell ?? 0, frame.h ?? spec.cell ?? 0),
        label: key,
      });
      cache.set(key, tex);
      return tex;
    },
    whenLoaded(fn) {
      if (done) {
        fn();
        return;
      }
      waiting.push(fn);
      void ensure();
    },
  };
}
