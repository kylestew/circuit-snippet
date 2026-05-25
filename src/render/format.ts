const prefixes: [number, string][] = [
  [1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'],
  [1, ''], [1e-3, 'm'], [1e-6, 'μ'], [1e-9, 'n'], [1e-12, 'p'],
];

export function formatSI(value: number, unit: string): string {
  if (value === 0) return `0${unit}`;
  const abs = Math.abs(value);
  for (const [threshold, prefix] of prefixes) {
    if (abs >= threshold) {
      const scaled = value / threshold;
      const str = scaled % 1 === 0 ? scaled.toString() : scaled.toPrecision(3);
      return `${str}${prefix}${unit}`;
    }
  }
  return `${value}${unit}`;
}
