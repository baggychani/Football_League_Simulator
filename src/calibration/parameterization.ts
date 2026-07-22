import type { RatingMap } from '../domain/types';
import { centerRatings } from './market';

/** Proper descending PAVA. Equal market-probability teams form an explicit tie tier. */
export function projectMarketOrder(ratings: RatingMap, target: RatingMap): RatingMap {
  const ordered = Object.keys(target).sort((a, b) => target[b] - target[a] || a.localeCompare(b));
  type Block = { ids: string[]; sum: number; weight: number; mean: number };
  const tiers: Block[] = [];
  for (const id of ordered) {
    const previousId = tiers.at(-1)?.ids[0];
    if (previousId !== undefined && target[previousId] === target[id]) {
      const tier = tiers.at(-1)!;
      tier.ids.push(id);
      tier.sum += ratings[id] ?? 0;
      tier.weight += 1;
      tier.mean = tier.sum / tier.weight;
    } else {
      tiers.push({ ids: [id], sum: ratings[id] ?? 0, weight: 1, mean: ratings[id] ?? 0 });
    }
  }

  const blocks: Block[] = [];
  for (const tier of tiers) {
    blocks.push(tier);
    while (blocks.length >= 2 && blocks.at(-2)!.mean < blocks.at(-1)!.mean) {
      const right = blocks.pop()!;
      const left = blocks.pop()!;
      const sum = left.sum + right.sum;
      const weight = left.weight + right.weight;
      blocks.push({ ids: [...left.ids, ...right.ids], sum, weight, mean: sum / weight });
    }
  }

  const projected: RatingMap = {};
  for (const block of blocks) for (const id of block.ids) projected[id] = block.mean;
  return centerRatings(projected);
}

export function applyZeroSumBasisStep(ids: string[], ratings: RatingMap, step: number[]): RatingMap {
  if (step.length !== ids.length - 1) throw new Error('A zero-sum basis needs n-1 coordinates.');
  const next = { ...ratings };
  let anchorDelta = 0;
  for (let index = 0; index < step.length; index++) {
    next[ids[index]] = (next[ids[index]] ?? 0) + step[index];
    anchorDelta -= step[index];
  }
  next[ids.at(-1)!] = (next[ids.at(-1)!] ?? 0) + anchorDelta;
  return centerRatings(next);
}

/** Trust-region clipping in rating space, including the implicit anchor club. */
export function clampZeroSumBasisStep(step: number[], maxAbsoluteRatingMove: number): number[] {
  const anchorMove = -step.reduce((sum, value) => sum + value, 0);
  const largest = Math.max(Math.abs(anchorMove), ...step.map(Math.abs), 0);
  if (largest <= maxAbsoluteRatingMove) return step;
  const scale = maxAbsoluteRatingMove / largest;
  return step.map(value => value * scale);
}

export function basisStepBetween(ids: string[], from: RatingMap, to: RatingMap): number[] {
  return ids.slice(0, -1).map(id => (to[id] ?? 0) - (from[id] ?? 0));
}

export function applyHeadShift(
  ids: string[],
  ratings: RatingMap,
  first: string,
  second: string,
  common: number,
  contrast: number,
): RatingMap {
  const next = { ...ratings };
  next[first] = (next[first] ?? 0) + common + contrast / 2;
  next[second] = (next[second] ?? 0) + common - contrast / 2;
  const rest = ids.filter(id => id !== first && id !== second);
  const compensation = rest.length ? (-2 * common) / rest.length : 0;
  for (const id of rest) next[id] = (next[id] ?? 0) + compensation;
  return centerRatings(next);
}
