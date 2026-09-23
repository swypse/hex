/** Stops the browser's default context menu (e.g. the "Save image as…" menu
 *  on mobile long-press / desktop right-click) from appearing on the game
 *  canvas or any of its controls (action buttons). The `contextmenu` event
 *  covers desktop and Android; iOS Safari long-presses instead show a copy/
 *  image callout, which is suppressed via the touch-callout/user-select CSS. */
export function preventCanvasContextMenu(canvas: HTMLCanvasElement): void {
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  const style = canvas.style;
  try {
    style.setProperty('-webkit-touch-callout', 'none');
    style.setProperty('-webkit-user-select', 'none');
    style.setProperty('user-select', 'none');
  } catch {
    // style may be read-only or unavailable in odd hosts — best effort.
  }
}