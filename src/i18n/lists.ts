import { currentLanguage, type Language } from '../storage/settings';

/** Grammatical class of a village-noun: masculine, feminine, or plural-only. */
export type NounKind = 'm' | 'f' | 'pl';

interface WordList {
  adjectives: string[];
  nouns: string[];
  /** Feminine adjective forms, aligned to `adjectives` (only for languages
   *  whose adjectives agree with noun gender, e.g. Russian). */
  adjectiveFeminine?: string[];
  /** Plural adjective forms, aligned to `adjectives`. */
  adjectivePlural?: string[];
  /** Gender/number class per noun, aligned to `nouns`. */
  nounKinds?: NounKind[];
}

const LISTS: Record<Language, WordList> = {
  en: {
    adjectives: ['green', 'golden', 'old', 'stone', 'hidden', 'sunny', 'misty', 'quiet', 'high', 'deep'],
    nouns: ['oak', 'hill', 'bridge', 'well', 'meadow', 'brook', 'moss', 'pines', 'rock', 'gate'],
  },
  ru: {
    adjectives: [
      'Зелёный', 'Золотой', 'Старый', 'Каменный', 'Скрытый',
      'Солнечный', 'Туманный', 'Тихий', 'Высокий', 'Глубокий',
    ],
    adjectiveFeminine: [
      'Зелёная', 'Золотая', 'Старая', 'Каменная', 'Скрытая',
      'Солнечная', 'Туманная', 'Тихая', 'Высокая', 'Глубокая',
    ],
    adjectivePlural: [
      'Зелёные', 'Золотые', 'Старые', 'Каменные', 'Скрытые',
      'Солнечные', 'Туманные', 'Тихие', 'Высокие', 'Глубокие',
    ],
    nouns: ['Дуб', 'Холм', 'Мост', 'Колодец', 'Луг', 'Ручей', 'Мох', 'Сосны', 'Скала', 'Ворота'],
    nounKinds: ['m', 'm', 'm', 'm', 'm', 'm', 'm', 'pl', 'f', 'pl'],
  },
};

function listFor(lang: Language): WordList {
  return LISTS[lang] ?? LISTS.en;
}

export function villageNameWords(): WordList {
  return listFor(currentLanguage());
}

function cap(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Adjective for `adjIdx` in `list` agreeing with the noun at `nounIdx`. */
function agreeingAdjective(list: WordList, adjIdx: number, nounIdx: number): string {
  const base = list.adjectives[adjIdx] ?? '';
  if (!base) return '';
  const kind = list.nounKinds?.[nounIdx];
  const formList = kind === 'f' ? list.adjectiveFeminine : kind === 'pl' ? list.adjectivePlural : undefined;
  if (!formList) return base;
  return formList[adjIdx] ?? base;
}

function composeName(list: WordList, adjIdx: number, nounIdx: number): string {
  const adj = agreeingAdjective(list, adjIdx, nounIdx);
  const noun = list.nouns[nounIdx] ?? '';
  return `${cap(adj)} ${cap(noun)}`.trim();
}

/** Compose a village name in the current language, agreeing the adjective with
 *  the noun in languages that inflect adjectives. */
export function villageNameAt(adjIdx: number, nounIdx: number): string {
  return composeName(listFor(currentLanguage()), adjIdx, nounIdx);
}

type FoundWord = { idx: number; kind: 'adj' | 'noun' };

/** Locate a word token in any language's vocabulary, recognizing inflected
 *  (feminine/plural) adjective forms as well as base forms. */
function findToken(token: string): FoundWord | null {
  const lower = token.toLowerCase();
  for (const lang of ['en', 'ru'] as Language[]) {
    const list = LISTS[lang];
    for (const forms of [list.adjectives, list.adjectiveFeminine, list.adjectivePlural]) {
      if (!forms) continue;
      const idx = forms.findIndex((w) => w.toLowerCase() === lower);
      if (idx >= 0) return { idx, kind: 'adj' };
    }
    const nounIdx = list.nouns.findIndex((w) => w.toLowerCase() === lower);
    if (nounIdx >= 0) return { idx: nounIdx, kind: 'noun' };
  }
  return null;
}

/** Convert a generated village name into the current language. `Name`s are the
 *  usual "adjective noun" pair; the adjective is inflected to agree with the
 *  noun when the target language does that (Russian). Unknown words are kept
 *  as-is. */
export function localizeVillageName(name: string): string {
  const target = listFor(currentLanguage());
  const tokens = name.split(' ');
  const found = tokens.map((token) => ({ token, word: findToken(token) }));

  // Pair form: re-render the whole name so the adjective agrees with the noun.
  const [first, second] = found;
  if (first?.word?.kind === 'adj' && second?.word?.kind === 'noun') {
    const adjIdx = first.word.idx;
    const nounIdx = second.word.idx;
    if (target.adjectives[adjIdx] !== undefined && target.nouns[nounIdx] !== undefined) {
      return composeName(target, adjIdx, nounIdx);
    }
  }

  // Fallback: translate word by word (single/unknown tokens kept untouched).
  return found
    .map(({ token, word }) => {
      if (!word) return token;
      const wordInTarget =
        word.kind === 'adj' ? target.adjectives[word.idx] : target.nouns[word.idx];
      return wordInTarget !== undefined ? cap(wordInTarget) : token;
    })
    .join(' ');
}
