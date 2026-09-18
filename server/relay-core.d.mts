export interface RelayConn {
  role: 'host' | 'client' | null;
  code: string | null;
  id: string | null;
  send(obj: unknown): void;
}

export class RelayCore {
  registerHost(conn: RelayConn, code: string): void;
  registerClient(conn: RelayConn, code: string): void;
  relayData(conn: RelayConn, msg: { type?: string; to?: string; data?: unknown }): void;
  handleClose(conn: RelayConn): void;
}