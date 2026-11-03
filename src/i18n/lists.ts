import { currentLanguage } from '../storage/settings';
import { CitySuffix, Language, NounKind, WordKind } from '@enums';



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
    nounKinds: [NounKind.M, NounKind.M, NounKind.M, NounKind.M, NounKind.M, NounKind.M, NounKind.M, NounKind.PL, NounKind.F, NounKind.PL],
  },
};

function listFor(lang: Language): WordList {
  return LISTS[lang] ?? LISTS.en;
}

function cap(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Adjective for `adjIdx` in `list` agreeing with the noun at `nounIdx`. */
function agreeingAdjective(list: WordList, adjIdx: number, nounIdx: number): string {
  const base = list.adjectives[adjIdx] ?? '';
  if (!base) return '';
  const kind = list.nounKinds?.[nounIdx];
  const formList = kind === NounKind.F ? list.adjectiveFeminine : kind === NounKind.PL ? list.adjectivePlural : undefined;
  if (!formList) return base;
  return formList[adjIdx] ?? base;
}

function composeName(list: WordList, adjIdx: number, nounIdx: number): string {
  const adj = agreeingAdjective(list, adjIdx, nounIdx);
  const noun = list.nouns[nounIdx] ?? '';
  return `${cap(adj)} ${cap(noun)}`.trim();
}

/** Suffix of a city-style village name in each language. */
const CITY_SUFFIXES: Record<CitySuffix, Record<Language, string>> = {
  [CitySuffix.TOWN]: { en: 'town', ru: 'таун' },
  [CitySuffix.VILLE]: { en: 'ville', ru: 'вилль' },
  [CitySuffix.CITY]: { en: 'city', ru: 'сити' },
  [CitySuffix.BURG]: { en: 'burg', ru: 'бург' },
  [CitySuffix.PORT]: { en: 'port', ru: 'порт' },
  [CitySuffix.FIELD]: { en: 'field', ru: 'филд' },
};

/** The animals a village can be named after, each with the suffix that sounds
 *  best with it and its English and Russian (transliterated) base name. One
 *  animal names at most one village per game. */
const VILLAGE_ANIMALS: { en: string; ru: string; suffix: CitySuffix }[] = [
  { en: 'fox', ru: 'фокс', suffix: CitySuffix.BURG },
  { en: 'owl', ru: 'оул', suffix: CitySuffix.TOWN },
  { en: 'wolf', ru: 'волф', suffix: CitySuffix.TOWN },
  { en: 'bear', ru: 'бир', suffix: CitySuffix.VILLE },
  { en: 'lion', ru: 'лайон', suffix: CitySuffix.BURG },
  { en: 'deer', ru: 'дир', suffix: CitySuffix.FIELD },
  { en: 'hare', ru: 'хэр', suffix: CitySuffix.TOWN },
  { en: 'seal', ru: 'сил', suffix: CitySuffix.PORT },
  { en: 'goat', ru: 'гоут', suffix: CitySuffix.VILLE },
  { en: 'mole', ru: 'моул', suffix: CitySuffix.TOWN },
  { en: 'lynx', ru: 'линкс', suffix: CitySuffix.BURG },
  { en: 'hawk', ru: 'хок', suffix: CitySuffix.BURG },
  { en: 'crow', ru: 'кроу', suffix: CitySuffix.FIELD },
  { en: 'swan', ru: 'суон', suffix: CitySuffix.PORT },
  { en: 'toad', ru: 'тоуд', suffix: CitySuffix.VILLE },
  { en: 'frog', ru: 'фрог', suffix: CitySuffix.TOWN },
  { en: 'newt', ru: 'ньют', suffix: CitySuffix.FIELD },
  { en: 'crab', ru: 'краб', suffix: CitySuffix.PORT },
  { en: 'moth', ru: 'мос', suffix: CitySuffix.TOWN },
  { en: 'wasp', ru: 'васп', suffix: CitySuffix.BURG },
  { en: 'eagle', ru: 'игл', suffix: CitySuffix.FIELD },
  { en: 'shark', ru: 'шарк', suffix: CitySuffix.CITY },
];

/** "Foxburg" in English, "Фокс-бург" in Russian. */
function cityName(animal: (typeof VILLAGE_ANIMALS)[number], lang: Language): string {
  const suffix = CITY_SUFFIXES[animal.suffix][lang];
  return lang === Language.RU ? `${cap(animal.ru)}-${suffix}` : cap(animal.en + suffix);
}

/** Every city-style village name in the current language, one per animal. */
export function villageAnimalNames(): string[] {
  const lang = currentLanguage();
  return VILLAGE_ANIMALS.map((a) => cityName(a, lang));
}

/** The name of a city-style village in the current language when `name` is one
 *  in either language; null otherwise (older "Old Oak" names are not). */
function localizeCityName(name: string): string | null {
  const lang = currentLanguage();
  const lower = name.toLowerCase();
  for (const animal of VILLAGE_ANIMALS) {
    for (const from of [Language.EN, Language.RU] as Language[]) {
      if (cityName(animal, from).toLowerCase() === lower) return cityName(animal, lang);
    }
  }
  return null;
}

type FoundWord = { idx: number; kind: WordKind };

/** Adjectives and animals used to generate AI player names per language. */
const PLAYER_ADJECTIVES: Record<Language, string[]> = {
  en: ['fury', 'glorious', 'tricky', 'silent', 'brave', 'cunning', 'savage', 'noble', 'ancient', 'wild'],
  ru: ['Яростный', 'Славный', 'Хитрый', 'Молчаливый', 'Храбрый', 'Коварный', 'Свирепый', 'Благородный', 'Древний', 'Дикий'],
};
const PLAYER_ANIMALS: Record<Language, string[]> = {
  en: ['fox', 'wolf', 'bear', 'hawk', 'lion', 'serpent', 'raven', 'tiger', 'boar', 'eagle'],
  ru: ['Лис', 'Волк', 'Медведь', 'Ястреб', 'Лев', 'Змей', 'Ворон', 'Тигр', 'Кабан', 'Орёл'],
};

export function playerNameWords(): { adjectives: string[]; animals: string[] } {
  const lang = currentLanguage();
  return { adjectives: PLAYER_ADJECTIVES[lang] ?? PLAYER_ADJECTIVES.en, animals: PLAYER_ANIMALS[lang] ?? PLAYER_ANIMALS.en };
}

/** Ordinal-rank label ("3rd", "2-е место") following each language's grammar. */
export function placeWord(rank: number): string {
  if (currentLanguage() === Language.RU) return `${rank}-е место`;
  const mod10 = rank % 10;
  const mod100 = rank % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13 ? 'th' :
    mod10 === 1 ? 'st' :
    mod10 === 2 ? 'nd' :
    mod10 === 3 ? 'rd' : 'th';
  return `${rank}${suffix}`;
}

/** Locate a word token in any language's vocabulary, recognizing inflected
 *  (feminine/plural) adjective forms as well as base forms. */
function findToken(token: string): FoundWord | null {
  const lower = token.toLowerCase();
  for (const lang of [Language.EN, Language.RU] as Language[]) {
    const list = LISTS[lang];
    for (const forms of [list.adjectives, list.adjectiveFeminine, list.adjectivePlural]) {
      if (!forms) continue;
      const idx = forms.findIndex((w) => w.toLowerCase() === lower);
      if (idx >= 0) return { idx, kind: WordKind.ADJ };
    }
    const nounIdx = list.nouns.findIndex((w) => w.toLowerCase() === lower);
    if (nounIdx >= 0) return { idx: nounIdx, kind: WordKind.NOUN };
  }
  return null;
}

/** Convert a generated village name into the current language. `Name`s are the
 *  usual "adjective noun" pair; the adjective is inflected to agree with the
 *  noun when the target language does that (Russian). Unknown words are kept
 *  as-is. */
export function localizeVillageName(name: string): string {
  const city = localizeCityName(name);
  if (city !== null) return city;
  const target = listFor(currentLanguage());
  const tokens = name.split(' ');
  const found = tokens.map((token) => ({ token, word: findToken(token) }));

  // Pair form: re-render the whole name so the adjective agrees with the noun.
  const [first, second] = found;
  if (first?.word?.kind === WordKind.ADJ && second?.word?.kind === WordKind.NOUN) {
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
        word.kind === WordKind.ADJ ? target.adjectives[word.idx] : target.nouns[word.idx];
      return wordInTarget !== undefined ? cap(wordInTarget) : token;
    })
    .join(' ');
}
