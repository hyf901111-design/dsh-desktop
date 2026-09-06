// Fabricated sample values, not market data or a real strategy backtest.
// Values are cumulative percentage returns, never recomputed when the theme changes.
const strategy = [0, 0.7, 0.45, 1.6, 2.4, 2.2, 3.15, 2.7, 3.8, 4.9,
  4.55, 5.8, 6.15, 5.65, 6.8, 7.7, 7.15, 6.25, 7.2, 8.55,
  8.2, 9.45, 10.4, 9.8, 10.8, 11.65, 10.9, 11.3, 12.1, 12.84];
const benchmark = [0, 0.3, 0.2, 0.65, 0.9, 0.65, 1.1, 0.9, 1.4, 1.65,
  1.45, 2.1, 2.35, 1.9, 2.4, 2.7, 2.45, 2.1, 2.6, 2.95,
  2.8, 3.3, 3.65, 3.35, 3.8, 4.1, 3.85, 4.2, 4.7, 5.16];

export const sampleData = strategy.map((value, index) => ({
  date: new Date(2026, 3, index + 1),
  name: `4/${index + 1}`,
  strategy: value,
  benchmark: benchmark[index],
}));

export type SamplePoint = (typeof sampleData)[number];
export const percent = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
