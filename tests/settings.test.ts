import { afterEach, describe, expect, it, vi } from 'vitest';
import { storageService } from '../src/storage/storage-service';
import {
  loadSettings,
  setAiDifficulty,
  setSoundEnabled,
  soundEnabled,
  selectedInfoClosed,
  setSelectedInfoClosed,
  playerName,
  setPlayerName,
} from '../src/storage/settings';

function fakeStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.spyOn(storageService, 'getItem').mockImplementation((k) => store.get(k) ?? null);
  vi.spyOn(storageService, 'setItem').mockImplementation((k, v) => {
    store.set(k, v);
  });
  return store;
}

describe('settings storage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads defaults when storage is empty', () => {
    fakeStorage();
    const s = loadSettings();
    expect(s.aiDifficulty).toBe('normal');
    expect(s.lang).toBe('en');
    expect(s.soundOn).toBe(true);
  });
});

describe('AI difficulty setting', () => {
  it('defaults to normal and round-trips', () => {
    fakeStorage();
    expect(loadSettings().aiDifficulty).toBe('normal');
    setAiDifficulty('hard');
    expect(loadSettings().aiDifficulty).toBe('hard');
    setAiDifficulty('normal');
    expect(loadSettings().aiDifficulty).toBe('normal');
  });
});

describe('Sound setting', () => {
  it('defaults to enabled', () => {
    fakeStorage();
    expect(loadSettings().soundOn).toBe(true);
    expect(soundEnabled()).toBe(true);
  });

  it('round-trips a disabled sound value', () => {
    fakeStorage();
    setSoundEnabled(false);
    expect(soundEnabled()).toBe(false);
    expect(loadSettings().soundOn).toBe(false);
    setSoundEnabled(true);
    expect(soundEnabled()).toBe(true);
    expect(loadSettings().soundOn).toBe(true);
  });
});

describe('Selected info panel state', () => {
  it('defaults to open', () => {
    fakeStorage();
    expect(loadSettings().selectedInfoClosed).toBe(false);
    expect(selectedInfoClosed()).toBe(false);
  });

  it('round-trips a collapsed panel', () => {
    fakeStorage();
    setSelectedInfoClosed(true);
    expect(selectedInfoClosed()).toBe(true);
    expect(loadSettings().selectedInfoClosed).toBe(true);
    setSelectedInfoClosed(false);
    expect(selectedInfoClosed()).toBe(false);
    expect(loadSettings().selectedInfoClosed).toBe(false);
  });
});

describe('Player name setting', () => {
  it('defaults to Player', () => {
    fakeStorage();
    expect(loadSettings().playerName).toBe('Player');
    expect(playerName()).toBe('Player');
  });

  it('round-trips a saved name', () => {
    fakeStorage();
    setPlayerName('Alex');
    expect(playerName()).toBe('Alex');
    expect(loadSettings().playerName).toBe('Alex');
  });

  it('falls back to Player for a blank saved name', () => {
    fakeStorage();
    setPlayerName('   ');
    expect(playerName()).toBe('Player');
  });
});
