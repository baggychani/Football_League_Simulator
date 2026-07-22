import { describe, expect, it } from 'vitest';
import { mergeMarketSnapshot, pricesFromGammaEvent } from '../calibration/polymarket';

describe('polymarket', () => {
  it('maps active gamma markets to simulator team ids', () => {
    const result = pricesFromGammaEvent({
      slug: 'epl-2027-champion-20260701200428749',
      title: 'EPL: 2027 Champion',
      markets: [
        {
          groupItemTitle: 'Arsenal',
          outcomePrices: '["0.365", "0.635"]',
          active: true,
        },
        {
          groupItemTitle: 'Coventry City',
          outcomePrices: '["0.0015", "0.9985"]',
          active: true,
        },
        {
          groupItemTitle: 'Other',
          outcomePrices: '["0.5", "0.5"]',
          active: true,
          negRiskOther: true,
        },
      ],
    });

    expect(result.prices.arsenal).toBeCloseTo(0.365);
    expect(result.prices.coventry).toBeCloseTo(0.0015);
    expect(result.unmatchedPolymarket).toEqual([]);
  });

  it('keeps previous prices for teams missing on Polymarket', () => {
    const merged = mergeMarketSnapshot({ arsenal: 0.37 }, { arsenal: 0.3, 'man-city': 0.29 });
    expect(merged.arsenal).toBe(0.37);
    expect(merged['man-city']).toBe(0.29);
  });
});
