import en from './locales/en';
import ru from './locales/ru';
import { currentLanguage } from '../storage/settings';
import { Language } from '@enums';

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

function availableLanguages(): { code: Language; label: string }[] {
  return [
    { code: Language.EN, label: dicts.en['lang.en'] ?? 'English' },
    { code: Language.RU, label: dicts.ru['lang.ru'] ?? 'Русский' },
  ];
}
