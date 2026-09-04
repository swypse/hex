import { isRoomCode } from './peerSession';

export const JOIN_QUERY_PARAM = 'join';

let pendingJoin: string | null = null;

function currentUrl(): string {
  if (typeof window !== 'undefined' && window.location) return window.location.href;
  return '';
}

/** Reads and validates a ?join=<code> room code from a URL (default: the app's
 * own location). Returns an uppercased room code or null when absent/invalid. */
export function readJoinCode(url = currentUrl()): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const raw = u.searchParams.get(JOIN_QUERY_PARAM);
    if (!raw) return null;
    const code = raw.trim().toUpperCase();
    return isRoomCode(code) ? code : null;
  } catch {
    return null;
  }
}

/** Builds a shareable link that opens the join screen with the code prefilled. */
export function buildJoinLink(code: string, url = currentUrl()): string {
  const clean = code.trim().toUpperCase();
  if (url) {
    try {
      const u = new URL(url);
      u.search = '';
      u.hash = '';
      u.searchParams.set(JOIN_QUERY_PARAM, clean);
      return u.toString();
    } catch {
      // fall through to the relative link
    }
  }
  const path = typeof window !== 'undefined' && window.location ? window.location.pathname : '/';
  return `${path}?${JOIN_QUERY_PARAM}=${clean}`;
}

/** Remembers a room code picked up from a join link so the lobby screen can
 * open straight on the join view once it mounts. */
export function setPendingJoin(code: string | null): void {
  pendingJoin = code;
}

export function consumePendingJoin(): string | null {
  const code = pendingJoin;
  pendingJoin = null;
  return code;
}
