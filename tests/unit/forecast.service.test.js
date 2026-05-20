const { computeMovingAverageForecast } = require('../../src/modules/forecast/forecast.service');

describe('computeMovingAverageForecast', () => {
  it('suggests reorder when stock below target', () => {
    const movements = [{ quantity: 30 }, { quantity: 30 }];
    const result = computeMovingAverageForecast(movements, 30, 7, 5, 10);
    expect(result.avgDailyUsage).toBe(2);
    expect(result.targetStock).toBe(24);
    expect(result.reorderQty).toBe(19);
  });

  it('returns zero reorder when stock is sufficient', () => {
    const movements = [{ quantity: 10 }];
    const result = computeMovingAverageForecast(movements, 30, 7, 100, 5);
    expect(result.reorderQty).toBe(0);
  });
});
