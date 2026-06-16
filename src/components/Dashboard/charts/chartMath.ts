// Pure chart math — kept out of tufte.tsx so that module exports only
// components (react-refresh/only-export-components).

/** Quantile of an unsorted numeric array (p in [0,1]). Returns 0 for empty. */
export function quantile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}
