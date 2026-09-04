import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../src/store/gameStore';

describe('gameStore', () => {
  beforeEach(() => {
    useGameStore.setState({
      screen: 'start',
      players: [],
      turn: 1,
      currentPlayerIndex: 0,
      aiActive: false,
      selection: null,
      overlay: null,
    });
  });

  it('starts on the start screen', () => {
    const s = useGameStore.getState();
    expect(s.screen).toBe('start');
  });

  it('setScreen updates the screen', () => {
    useGameStore.getState().setScreen('setup');
    expect(useGameStore.getState().screen).toBe('setup');
  });

  it('setOverlay opens and closes a simple overlay', () => {
    useGameStore.getState().setOverlay({ kind: 'stats' });
    expect(useGameStore.getState().overlay).toEqual({ kind: 'stats' });
    useGameStore.getState().setOverlay(null);
    expect(useGameStore.getState().overlay).toBeNull();
  });

  it('setOverlay carries the target for confirm and shipLanding overlays', () => {
    useGameStore.getState().setOverlay({ kind: 'confirm', target: { q: 3, r: 4 } });
    expect(useGameStore.getState().overlay).toEqual({ kind: 'confirm', target: { q: 3, r: 4 } });
    useGameStore.getState().setOverlay({ kind: 'shipLanding', target: { q: 1, r: 2 } });
    expect(useGameStore.getState().overlay).toEqual({ kind: 'shipLanding', target: { q: 1, r: 2 } });
    useGameStore.getState().setOverlay(null);
    expect(useGameStore.getState().overlay).toBeNull();
  });

  it('opening one overlay replaces another', () => {
    useGameStore.getState().setOverlay({ kind: 'spawn' });
    useGameStore.getState().setOverlay({ kind: 'skill' });
    expect(useGameStore.getState().overlay).toEqual({ kind: 'skill' });
  });

  it('setSelection and setAiActive update state', () => {
    const store = useGameStore;
    store.getState().setAiActive(true);
    store.getState().setSelection({ kind: 'terrain', q: 1, r: 2 });
    expect(store.getState().aiActive).toBe(true);
    expect(store.getState().selection).toEqual({ kind: 'terrain', q: 1, r: 2 });
  });

  it('setLocalPlayerIndex updates localPlayerIndex', () => {
    useGameStore.getState().setLocalPlayerIndex(2);
    expect(useGameStore.getState().localPlayerIndex).toBe(2);
  });

  it('setMyPeerId updates myPeerId', () => {
    useGameStore.getState().setMyPeerId('guest-abc');
    expect(useGameStore.getState().myPeerId).toBe('guest-abc');
  });

  it('setPlayersOnline updates playersOnline', () => {
    useGameStore.getState().setPlayersOnline([true, false, true]);
    expect(useGameStore.getState().playersOnline).toEqual([true, false, true]);
  });

  it('setTexturesLoading updates texturesLoading', () => {
    useGameStore.getState().setTexturesLoading(true);
    expect(useGameStore.getState().texturesLoading).toBe(true);
    useGameStore.getState().setTexturesLoading(false);
    expect(useGameStore.getState().texturesLoading).toBe(false);
  });

  it('queues center messages so none are lost, showing them one at a time', () => {
    const store = () => useGameStore.getState();
    store().setCenterMessage('first');
    expect(store().centerMessage).toBe('first');
    store().setCenterMessage('second');
    expect(store().centerMessage).toBe('first');
    expect(store().centerMessageQueue).toEqual(['second']);
    store().setCenterMessage('third');
    expect(store().centerMessageQueue).toEqual(['second', 'third']);
    // Dismissing advances to the next queued message.
    store().setCenterMessage(null);
    expect(store().centerMessage).toBe('second');
    expect(store().centerMessageQueue).toEqual(['third']);
    store().setCenterMessage(null);
    expect(store().centerMessage).toBe('third');
    store().setCenterMessage(null);
    expect(store().centerMessage).toBeNull();
    expect(store().centerMessageQueue).toEqual([]);
  });
});
