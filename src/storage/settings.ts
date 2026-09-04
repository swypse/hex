import { storageService } from './storageService';
import { AiDifficulty, DEFAULT_AI_DIFFICULTY } from '../game/aiDifficulty';

const SETTINGS_KEY = 'hex-settings-v1';

export interface GameSettings {
  attackConfirmation: boolean;
  aiDifficulty: AiDifficulty;
  disableTips: boolean;
}

const DEFAULTS: GameSettings = {
  attackConfirmation: true,
  aiDifficulty: DEFAULT_AI_DIFFICULTY,
  disableTips: false,
};

export function loadSettings(): GameSettings {
  try {
    const raw = storageService.getItem(SETTINGS_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      return { ...DEFAULTS, ...parsed };
    }
  } catch {
    // storage unavailable (e.g. tests / private mode) — fall back to defaults.
  }
  return { ...DEFAULTS };
}

export function saveSettings(settings: GameSettings): void {
  try {
    storageService.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable — ignore.
  }
}

export function attackConfirmationEnabled(): boolean {
  return loadSettings().attackConfirmation;
}

export function setAttackConfirmation(enabled: boolean): void {
  saveSettings({ ...loadSettings(), attackConfirmation: enabled });
}

export function tipsDisabled(): boolean {
  return loadSettings().disableTips;
}

export function setTipsDisabled(disabled: boolean): void {
  saveSettings({ ...loadSettings(), disableTips: disabled });
}

export function setAiDifficulty(level: AiDifficulty): void {
  saveSettings({ ...loadSettings(), aiDifficulty: level });
}
