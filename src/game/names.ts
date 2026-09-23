import { SeededRandom } from '../util/random';
import { playerNameWords, villageNameWords, villageNameAt } from '../i18n/lists';

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function generatePlayerNames(count: number, rng: SeededRandom): string[] {
  const { adjectives, animals } = playerNameWords();
  const combos = adjectives.flatMap((adj) =>
    animals.map((animal) => `${capitalize(adj)} ${capitalize(animal)}`),
  );
  return rng.shuffle(combos).slice(0, count);
}

export function generateVillageNames(count: number, rng: SeededRandom): string[] {
  const { adjectives, nouns } = villageNameWords();
  const combos = adjectives.flatMap((_, adjIdx) =>
    nouns.map((_, nounIdx) => villageNameAt(adjIdx, nounIdx)),
  );
  return rng.shuffle(combos).slice(0, count);
}
