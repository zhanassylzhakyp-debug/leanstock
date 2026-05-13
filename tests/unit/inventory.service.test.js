const { calculateDecayDiscount } = require('../../src/modules/inventory/inventory.service');

describe('calculateDecayDiscount', () => {
  const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  test('returns 0 when product sold recently (< 30 days)', () => {
    expect(calculateDecayDiscount(daysAgo(10))).toBe(0);
  });

  test('returns 0 when lastSoldAt is null', () => {
    expect(calculateDecayDiscount(null)).toBe(0);
  });

  test('returns tier1 discount (10%) after 30 days', () => {
    expect(calculateDecayDiscount(daysAgo(35))).toBe(10);
  });

  test('returns tier2 discount (25%) after 60 days', () => {
    expect(calculateDecayDiscount(daysAgo(65))).toBe(25);
  });

  test('returns tier3 discount (40%) after 90 days', () => {
    expect(calculateDecayDiscount(daysAgo(95))).toBe(40);
  });

  test('respects maxDiscount cap', () => {
    const result = calculateDecayDiscount(daysAgo(200), { tier3Days: 90, tier3Discount: 99, maxDiscount: 50 });
    expect(result).toBe(50);
  });

  test('uses custom configurable rules', () => {
    const rules = {
      tier1Days: 7,
      tier1Discount: 5,
      tier2Days: 14,
      tier2Discount: 15,
      tier3Days: 30,
      tier3Discount: 30,
      maxDiscount: 30,
    };
    expect(calculateDecayDiscount(daysAgo(10), rules)).toBe(5);
    expect(calculateDecayDiscount(daysAgo(20), rules)).toBe(15);
    expect(calculateDecayDiscount(daysAgo(40), rules)).toBe(30);
  });

  test('boundary: exactly 30 days triggers tier1', () => {
    expect(calculateDecayDiscount(daysAgo(30))).toBe(10);
  });

  test('boundary: exactly 29 days returns 0', () => {
    expect(calculateDecayDiscount(daysAgo(29))).toBe(0);
  });
});
