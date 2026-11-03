import type { RelayCore, RelayConn } from '../relay-core';

export interface ServerSocketLike {
  readyState: number;
  send(data: string): void;
  addEventListener(type: string, cb: (event: { data?: string | ArrayBuffer }) => void): void;
}

export function wireMember(socket: ServerSocketLike, core: RelayCore): RelayConn;