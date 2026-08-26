// Pure formatting helpers. Safe to use in Server or Client Components.

export function fmtMYR(value: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact) {
    // parseFloat strips trailing zeros: 8.40 -> 8.4
    if (Math.abs(value) >= 1_000_000) return `RM${parseFloat((value / 1_000_000).toFixed(2))}M`;
    if (Math.abs(value) >= 1_000) return `RM${(value / 1_000).toFixed(0)}k`;
    return `RM${value.toFixed(0)}`;
  }
  return `RM${value.toLocaleString("en-MY", { maximumFractionDigits: 0 })}`;
}

export function fmtKwhToGwh(kwh: number, digits = 2): string {
  return `${(kwh / 1_000_000).toFixed(digits)} GWh`;
}

export function fmtPct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function fmtTonnes(t: number): string {
  return `${t.toLocaleString("en-MY", { maximumFractionDigits: 0 })} tCO₂e`;
}

export function fmtYears(y: number | null): string {
  if (y === null) return "—";
  return `${y.toFixed(1)} yrs`;
}

// Unit-price formatting keeps the fractional detail (e.g. RM0.452/kWh).
export function fmtUnit(value: number, unit: string): string {
  return `RM${value.toFixed(3)}/${unit.split("/")[1] ?? "kWh"}`;
}
