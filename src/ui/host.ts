import { Application, Container } from 'pixi.js';

export interface UIHost {
  app: Application;
  screenLayer: Container;
  overlayLayer: Container;
}

export interface ScreenController {
  mount(host: UIHost): void;
  destroy(): void;
}

export interface Widget {
  mount(host: UIHost, root: Container): void;
  destroy(): void;
}
