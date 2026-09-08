import { afterEach, describe, expect, it, vi } from 'vitest';
import { storageService } from '../src/storage/storageService';
import {
  attackConfirmationEnabled,
  loadSettings,
  saveSettings,
  setAiDifficulty,
  setAttackConfirmation,
  setSoundEnabled,
  setTipsDisabled,
  soundEnabled,
  tipsDisabled,
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

  it('defaults attack confirmation to enabled', () => {
    fakeStorage();
    expect(loadSettings().attackConfirmation).toBe(true);
    expect(attackConfirmationEnabled()).toBe(true);
  });

  it('persists an attack confirmation value', () => {
    fakeStorage();
    saveSettings({ attackConfirmation: false, aiDifficulty: 'normal', disableTips: false, lang: 'en', soundOn: true });
    expect(loadSettings().attackConfirmation).toBe(false);
    expect(attackConfirmationEnabled()).toBe(false);
    setAttackConfirmation(true);
    expect(attackConfirmationEnabled()).toBe(true);
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

describe('Disable tips setting', () => {
  it('defaults to tips enabled', () => {
    fakeStorage();
    expect(loadSettings().disableTips).toBe(false);
    expect(tipsDisabled()).toBe(false);
  });

  it('round-trips a disabled-tips value', () => {
    fakeStorage();
    setTipsDisabled(true);
    expect(tipsDisabled()).toBe(true);
    setTipsDisabled(false);
    expect(tipsDisabled()).toBe(false);
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
