import { storageService } from './storageService';
import { AiDifficulty, DEFAULT_AI_DIFFICULTY } from '../game/aiDifficulty';

const SETTINGS_KEY = 'hex-settings-v1';

export type Language = 'en' | 'ru';

interface GameSettings {
  aiDifficulty: AiDifficulty;
  lang: Language;
  soundOn: boolean;
  /** The selected-cell info panel collapsed to just the info icon. */
  selectedInfoClosed: boolean;
}

const DEFAULTS: GameSettings = {
  aiDifficulty: DEFAULT_AI_DIFFICULTY,
  lang: 'en',
  soundOn: true,
  selectedInfoClosed: false,
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

function saveSettings(settings: GameSettings): void {
  try {
    storageService.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable — ignore.
  }
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

export function selectedInfoClosed(): boolean {
  return loadSettings().selectedInfoClosed;
}

export function setSelectedInfoClosed(closed: boolean): void {
  saveSettings({ ...loadSettings(), selectedInfoClosed: closed });
}
