/** The only text sizes (CSS px) the game's labels use. Every distinct size
 *  rasterises its own bitmap font per weight, so the UI sticks to this short
 *  scale instead of a size per widget. */
export enum FontSize {
  VERY_SMALL = 12,
  SMALL = 14,
  NORMAL = 16,
  BIG = 20,
}
