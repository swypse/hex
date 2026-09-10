import { storageService } from './storageService';
import { AiDifficulty, DEFAULT_AI_DIFFICULTY } from '../game/aiDifficulty';

const SETTINGS_KEY = 'hex-settings-v1';

export type Language = 'en' | 'ru';

export interface GameSettings {
  aiDifficulty: AiDifficulty;
  disableTips: boolean;
  lang: Language;
  soundOn: boolean;
}

const DEFAULTS: GameSettings = {
  aiDifficulty: DEFAULT_AI_DIFFICULTY,
  disableTips: false,
  lang: 'en',
  soundOn: true,
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

export function tipsDisabled(): boolean {
  return loadSettings().disableTips;
}

export function setTipsDisabled(disabled: boolean): void {
  saveSettings({ ...loadSettings(), disableTips: disabled });
}

export function setAiDifficulty(level: AiDifficulty): void {
  saveSettings({ ...loadSettings(), aiDifficulty: level });
}

export function currentLanguage(): Language {
  return loadSettings().lang;
}

export function setLanguage(lang: Language): void {
  saveSettings({ ...loadSettings(), lang });
}

export function soundEnabled(): boolean {
  return loadSettings().soundOn;
}

export function setSoundEnabled(enabled: boolean): void {
  saveSettings({ ...loadSettings(), soundOn: enabled });
}
