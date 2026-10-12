import { SeededRandom } from '../util/random';
import { playerNameWords, villageAnimalNames } from '../i18n/lists';

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

/** City-style village names ("Foxburg"): each animal names at most one village,
 *  so no two names of a game share an animal. */
export function generateVillageNames(count: number, rng: SeededRandom): string[] {
  return rng.shuffle(villageAnimalNames()).slice(0, count);
}
