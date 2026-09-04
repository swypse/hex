import { ClientMessage, HostMessage } from './peerSession';

export interface WebSocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

export interface RelayHostEvents {
  onReady: () => void;
  onClientJoined: (clientId: string) => void;
  onData: (clientId: string, msg: ClientMessage) => void;
  onClientClosed: (clientId: string) => void;
  onError: (err: Error) => void;
}

export interface RelayClientEvents {
  onRegistered: (selfId: string) => void;
  onJoined: () => void;
  onData: (msg: HostMessage) => void;
  onClose: () => void;
  onError: (err: Error) => void;
}

const DEFAULT_RELAY_URL = 'wss://swypse-hex.bonto.run/ws';

export function relayUrl(): string {
  const explicit = import.meta.env.VITE_RELAY_URL;
  if (explicit) return explicit;
  if (typeof window !== 'undefined' && window.location && /^localhost(:\d+)?$/.test(window.location.hostname)) {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${window.location.host}/ws`;
  }
  return DEFAULT_RELAY_URL;
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
const RETRY_DELAY_MS = 1000;

abstract class RelaySessionBase {
  protected roleName = 'peer';
  protected socket: WebSocketLike | null = null;
  protected code = '';
  protected closed = false;
  protected attempts = 0;
  protected retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    protected readonly url: string = relayUrl(),
    protected readonly createSocket: (url: string) => WebSocketLike = defaultWebSocket,
  ) {}

  protected openSocket(): void {
    if (this.closed) return;
    let socket: WebSocketLike;
    try {
      socket = this.createSocket(this.url);
    } catch (err) {
      this.fail(err instanceof Error ? err : new Error('Could not connect to the relay server.'));
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
    if (this.attempts >= MAX_ATTEMPTS) {
      console.error(`[relay:${this.roleName}] giving up after ${this.attempts} attempts`);
      this.fail(new Error('Could not reach the game server. Check your connection and try again.'));
      return;
    }
    console.log(`[relay:${this.roleName}] retrying in ${RETRY_DELAY_MS}ms (attempt ${this.attempts + 1})`);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      fn();
    }, RETRY_DELAY_MS);
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
  ) {
    super(url, createSocket);
    this.roleName = 'client';
  }

  getPeerId(): string | null {
    return this.selfId;
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
            this.events.onError(err instanceof Error ? err : new Error('Failed to process a message from the host.'));
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
