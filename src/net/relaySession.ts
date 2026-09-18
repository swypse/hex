import { ClientMessage, HostMessage } from './peerSession';
import { t } from '../i18n';

export interface WebSocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

interface RelaySessionOptions {
  /** Once in a game, keep retrying for ~5 min instead of the short lobby cap. */
  inGame?: boolean;
  /** Override the retry interval (tests use small values). */
  retryDelayMs?: number;
}

interface RelayHostEvents {
  onReady: () => void;
  onClientJoined: (clientId: string) => void;
  onData: (clientId: string, msg: ClientMessage) => void;
  onClientClosed: (clientId: string) => void;
  onError: (err: Error) => void;
}

interface RelayClientEvents {
  onRegistered: (selfId: string) => void;
  onJoined: () => void;
  onData: (msg: HostMessage) => void;
  onClose: () => void;
  onError: (err: Error) => void;
}

const DEFAULT_RELAY_URL = 'wss://hex-relay.swypse.workers.dev/ws';

const RELAY_QUERY_PARAM = 'relay';
const RELAY_STORAGE_KEY = 'hex.relayUrl';

function normalizeRelayUrl(value: string): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== 'ws:' && u.protocol !== 'wss:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Resolves the relay transport the sessions should use. Precedence:
 *  `?relay=<ws|wss url>` query param > localStorage override > the
 *  default Cloudflare worker. Lets rooms / installs route around a blocked
 *  relay (e.g. a self-hosted `server/relay.mjs`) without a rebuild. */
export function resolveRelayUrl(): string {
  if (typeof window !== 'undefined') {
    try {
      const query = new URL(window.location.href).searchParams.get(RELAY_QUERY_PARAM);
      if (query) {
        const url = normalizeRelayUrl(query);
        if (url) return url;
      }
      const stored = window.localStorage?.getItem(RELAY_STORAGE_KEY);
      if (stored) {
        const url = normalizeRelayUrl(stored);
        if (url) return url;
      }
    } catch {
      // ignore unobtainable browser state
    }
  }
  return DEFAULT_RELAY_URL;
}

export function relayQueryParam(): string {
  return RELAY_QUERY_PARAM;
}

/** Appends the room code so Cloudflare can route to the per-room Durable Object. */
function withRoomCode(base: string, code: string): string {
  if (!code) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}code=${encodeURIComponent(code)}`;
}

type ServerMessage =
  | { type: 'registered'; id: string }
  | { type: 'room-not-found' }
  | { type: 'host-left' }
  | { type: 'client-joined'; clientId: string }
  | { type: 'client-left'; clientId: string }
  | { type: 'error'; message: string }
  | { type: 'data'; from: string; data: unknown };

const MAX_ATTEMPTS = 12;
/** Once a game has started a client keeps trying to reach the host for ~5
 *  minutes (transient drops, e.g. host laptop sleep), instead of the short
 *  lobby cap. */
const MAX_ATTEMPTS_IN_GAME = 300;
const RETRY_DELAY_MS = 1000;

abstract class RelaySessionBase {
  protected roleName = 'peer';
  protected socket: WebSocketLike | null = null;
  protected code = '';
  protected closed = false;
  protected attempts = 0;
  protected retryTimer: ReturnType<typeof setTimeout> | null = null;
  protected inGame = false;
  protected retryDelayMs: number | undefined;

  constructor(
    protected readonly url: string = resolveRelayUrl(),
    protected readonly createSocket: (url: string) => WebSocketLike = defaultWebSocket,
    protected readonly opts: RelaySessionOptions = {},
  ) {
    this.inGame = opts.inGame ?? false;
    this.retryDelayMs = opts.retryDelayMs;
  }

  protected openSocket(): void {
    if (this.closed) return;
    let socket: WebSocketLike;
    try {
      socket = this.createSocket(withRoomCode(this.url, this.code));
    } catch (err) {
      this.fail(err instanceof Error ? err : new Error(t('net.relayConnect')));
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      console.log(`[relay:${this.roleName}] socket open`, this.url);
      this.onSocketOpen();
    };
    socket.onmessage = (ev) => this.onSocketMessage(ev.data);
    socket.onclose = () => {
      console.log(`[relay:${this.roleName}] socket closed`, this.url);
      this.onSocketClosed();
    };
    socket.onerror = () => console.error(`[relay:${this.roleName}] socket error`, this.url);
  }

  protected sendRaw(msg: unknown): void {
    if (!this.socket) {
      console.warn(`[relay:${this.roleName}] drop: socket is closed, message not sent`, (msg as { type?: string }).type);
      return;
    }
    try {
      this.socket.send(JSON.stringify(msg));
    } catch (err) {
      console.error(`[relay:${this.roleName}] send failed`, err);
    }
  }

  protected scheduleRetry(fn: () => void): void {
    if (this.closed || this.retryTimer) return;
    const maxAttempts = this.inGame ? MAX_ATTEMPTS_IN_GAME : MAX_ATTEMPTS;
    if (this.attempts >= maxAttempts) {
      console.error(`[relay:${this.roleName}] giving up after ${this.attempts} attempts`);
      this.fail(new Error(t('net.relayUnreachable')));
      return;
    }
    console.log(`[relay:${this.roleName}] retrying in ${RETRY_DELAY_MS}ms (attempt ${this.attempts + 1})`);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      fn();
    }, this.retryDelayMs ?? RETRY_DELAY_MS);
  }

  protected clearRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  protected abstract onSocketOpen(): void;
  protected abstract onSocketClosed(): void;
  protected abstract onSocketMessage(raw: string): void;
  protected abstract fail(err: Error): void;

  close(): void {
    this.closed = true;
    this.clearRetry();
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      try {
        this.socket.close();
      } catch {
        // already closed
      }
      this.socket = null;
    }
  }
}

function defaultWebSocket(url: string): WebSocketLike {
  return new WebSocket(url) as unknown as WebSocketLike;
}

function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const msg: unknown = JSON.parse(raw);
    if (msg !== null && typeof msg === 'object' && typeof (msg as { type?: unknown }).type === 'string') {
      return msg as ServerMessage;
    }
  } catch {
    // ignore malformed frames
  }
  return null;
}

export class RelayHostSession extends RelaySessionBase {
  constructor(
    private readonly events: RelayHostEvents,
    url?: string,
    createSocket?: (url: string) => WebSocketLike,
  ) {
    super(url, createSocket);
    this.roleName = 'host';
  }

  open(code: string): void {
    this.code = code;
    this.openSocket();
  }

  sendTo(clientId: string, msg: HostMessage): void {
    this.sendRaw({ type: 'data', to: clientId, data: msg });
  }

  broadcast(msg: HostMessage): void {
    this.sendRaw({ type: 'data', to: 'all', data: msg });
  }

  protected onSocketOpen(): void {
    this.attempts++;
    this.sendRaw({ type: 'register', role: 'host', code: this.code });
  }

  protected onSocketMessage(raw: string): void {
    const msg = parseServerMessage(raw);
    if (!msg) return;
    switch (msg.type) {
      case 'registered':
        this.clearRetry();
        this.attempts = 0;
        this.events.onReady();
        break;
      case 'client-joined':
        this.events.onClientJoined(msg.clientId);
        break;
      case 'client-left':
        this.events.onClientClosed(msg.clientId);
        break;
      case 'data':
        if (msg.data !== null && typeof msg.data === 'object' && 'type' in (msg.data as object)) {
          this.events.onData(msg.from, msg.data as ClientMessage);
        }
        break;
      case 'error':
        this.events.onError(new Error(msg.message));
        break;
      case 'room-not-found':
      case 'host-left':
        break;
    }
  }

  protected onSocketClosed(): void {
    if (this.closed) return;
    this.socket = null;
    this.scheduleRetry(() => this.openSocket());
  }

  protected fail(err: Error): void {
    if (this.closed) return;
    this.events.onError(err);
  }
}

export class RelayClientSession extends RelaySessionBase {
  private selfId: string | null = null;
  private joined = false;
  private name = '';

  constructor(
    private readonly events: RelayClientEvents,
    url?: string,
    createSocket?: (url: string) => WebSocketLike,
    opts?: RelaySessionOptions,
  ) {
    super(url, createSocket, opts);
    this.roleName = 'client';
  }

  getPeerId(): string | null {
    return this.selfId;
  }

  /** Called once a game has started so reconnect retries wait much longer
   *  (transient host drops) instead of giving up at the lobby cap. */
  setInGame(v: boolean): void {
    this.inGame = v;
  }

  join(code: string, name: string): void {
    this.code = code;
    this.name = name;
    this.openSocket();
  }

  send(msg: ClientMessage): void {
    if (this.joined) this.sendRaw({ type: 'data', data: msg });
  }

  protected onSocketOpen(): void {
    this.attempts++;
    this.sendRaw({ type: 'register', role: 'client', code: this.code });
  }

  protected onSocketMessage(raw: string): void {
    const msg = parseServerMessage(raw);
    if (!msg) return;
    switch (msg.type) {
      case 'registered':
        this.clearRetry();
        this.attempts = 0;
        this.selfId = msg.id;
        this.events.onRegistered(msg.id);
        this.joined = true;
        this.sendRaw({ type: 'data', data: { type: 'join', name: this.name } });
        this.events.onJoined();
        break;
      case 'room-not-found':
        this.socket?.close();
        this.socket = null;
        this.scheduleRetry(() => this.openSocket());
        break;
      case 'host-left':
        this.reconnect();
        break;
      case 'data':
        if (msg.from === 'host' && msg.data !== null && typeof msg.data === 'object' && 'type' in (msg.data as object)) {
          try {
            this.events.onData(msg.data as HostMessage);
          } catch (err) {
            this.events.onError(err instanceof Error ? err : new Error(t('net.hostMessage')));
          }
        }
        break;
      case 'error':
        this.fail(new Error(msg.message));
        break;
      case 'client-joined':
      case 'client-left':
        break;
    }
  }

  private reconnect(): void {
    if (this.closed) return;
    this.joined = false;
    this.selfId = null;
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // already closed
      }
      this.socket = null;
    }
    this.scheduleRetry(() => this.openSocket());
  }

  protected onSocketClosed(): void {
    if (this.closed) return;
    this.socket = null;
    this.reconnect();
  }

  protected fail(err: Error): void {
    if (this.closed) return;
    this.events.onError(err);
  }
}
