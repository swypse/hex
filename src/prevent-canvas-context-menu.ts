/** Stops the browser's default context menu (e.g. the "Save image as…" menu
 *  on mobile long-press / desktop right-click) from appearing on the game
 *  canvas. */
export function preventCanvasContextMenu(canvas: HTMLCanvasElement): void {
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}