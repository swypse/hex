export enum RelayServerMessageType {
  REGISTERED = 'registered',
  ROOM_NOT_FOUND = 'room-not-found',
  HOST_LEFT = 'host-left',
  CLIENT_JOINED = 'client-joined',
  CLIENT_LEFT = 'client-left',
  ERROR = 'error',
  DATA = 'data',
}
