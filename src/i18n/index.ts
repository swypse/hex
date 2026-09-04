import en from './locales/en';
import ru from './locales/ru';
import { type Language, currentLanguage } from '../storage/settings';

const dicts: Record<Language, Record<string, string>> = {
  en: en as Record<string, string>,
  ru: ru as Record<string, string>,
};

export function t(key: string, params?: Record<string, string | number>): string {
  const dict = dicts[currentLanguage()] ?? en;
  let text = dict[key] ?? dicts.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}

export function availableLanguages(): { code: Language; label: string }[] {
  return [
    { code: 'en', label: dicts.en['lang.en'] ?? 'English' },
    { code: 'ru', label: dicts.ru['lang.ru'] ?? 'Русский' },
  ];
}
