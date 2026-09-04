import { SeededRandom } from '../util/random';

export const ADJECTIVES = [
  'fury',
  'glorious',
  'tricky',
  'silent',
  'brave',
  'cunning',
  'savage',
  'noble',
  'ancient',
  'wild',
];

export const ANIMALS = [
  'fox',
  'wolf',
  'bear',
  'hawk',
  'lion',
  'serpent',
  'raven',
  'tiger',
  'boar',
  'eagle',
];

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function generatePlayerNames(count: number, rng: SeededRandom): string[] {
  const combos = ADJECTIVES.flatMap((adj) =>
    ANIMALS.map((animal) => `${capitalize(adj)} ${capitalize(animal)}`),
  );
  return rng.shuffle(combos).slice(0, count);
}

export const VILLAGE_ADJECTIVES = [
  'green', 'golden', 'old', 'stone', 'hidden',
  'sunny', 'misty', 'quiet', 'high', 'deep',
];

export const VILLAGE_NOUNS = [
  'oak', 'hill', 'bridge', 'well', 'meadow',
  'brook', 'moss', 'pines', 'rock', 'gate',
];

export function generateVillageNames(count: number, rng: SeededRandom): string[] {
  const combos = VILLAGE_ADJECTIVES.flatMap((adj) =>
    VILLAGE_NOUNS.map((noun) => `${capitalize(adj)} ${capitalize(noun)}`),
  );
  return rng.shuffle(combos).slice(0, count);
}
