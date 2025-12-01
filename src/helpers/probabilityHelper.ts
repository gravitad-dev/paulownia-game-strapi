/**
 * Weighted random selection helper
 * Selects a random item from an array based on weighted probabilities
 * 
 * @template T - The type of items in the array
 * @param items - Array of items to select from
 * @param getWeight - Function that returns the weight/probability for each item
 * @returns The selected item, or null if array is empty or all weights are 0
 * 
 * @example
 * const rewards = [
 *   { name: 'Common', probability: 60 },
 *   { name: 'Rare', probability: 30 },
 *   { name: 'Epic', probability: 10 }
 * ];
 * const selected = weightedRandomSelection(rewards, r => r.probability);
 */
export function weightedRandomSelection<T>(
  items: T[],
  getWeight: (item: T) => number
): T | null {
  if (!items || items.length === 0) {
    return null;
  }

  // Calculate total weight
  const totalWeight = items.reduce((sum, item) => {
    const weight = getWeight(item);
    return sum + (weight > 0 ? weight : 0);
  }, 0);

  if (totalWeight <= 0) {
    return null;
  }

  // Generate random number between 0 and totalWeight
  const random = Math.random() * totalWeight;

  // Find the item that corresponds to this random number
  let cumulativeWeight = 0;
  for (const item of items) {
    const weight = getWeight(item);
    if (weight > 0) {
      cumulativeWeight += weight;
      if (random <= cumulativeWeight) {
        return item;
      }
    }
  }

  // Fallback (should never reach here due to floating point precision)
  return items[items.length - 1];
}
