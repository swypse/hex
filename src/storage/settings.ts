import { storageService } from './storageService';
import { AiDifficulty, DEFAULT_AI_DIFFICULTY } from '../game/aiDifficulty';

const SETTINGS_KEY = 'hex-settings-v1';

export type Language = 'en' | 'ru';

export const DEFAULT_PLAYER_NAME = 'Player';

interface GameSettings {
  aiDifficulty: AiDifficulty;
  lang: Language;
  soundOn: boolean;
  /** The selected-cell info panel collapsed to just the info icon. */
  selectedInfoClosed: boolean;
  /** The player name used as the multiplayer lobby default. */
  playerName: string;
}

const DEFAULTS: GameSettings = {
  aiDifficulty: DEFAULT_AI_DIFFICULTY,
  lang: 'en',
  soundOn: true,
  selectedInfoClosed: false,
  playerName: DEFAULT_PLAYER_NAME,
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

export function playerName(): string {
  const name = loadSettings().playerName.trim();
  return name.length > 0 ? name : DEFAULT_PLAYER_NAME;
}

export function setPlayerName(name: string): void {
  saveSettings({ ...loadSettings(), playerName: name.trim() || DEFAULT_PLAYER_NAME });
}
