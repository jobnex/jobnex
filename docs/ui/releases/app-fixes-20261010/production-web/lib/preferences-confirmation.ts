export type Preferences = Record<string, unknown>;
const metadata = ["isConfirmed", "confirmedAt", "lastConfirmedPreferences"];
export function preferenceSnapshot(value: Preferences): Preferences {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !metadata.includes(key)));
}
export function pendingPreferences(existing: Preferences, updates: Preferences): Preferences {
  return { ...existing, ...preferenceSnapshot(updates), isConfirmed: false,
    confirmedAt: existing.confirmedAt ?? null,
    lastConfirmedPreferences: existing.lastConfirmedPreferences ?? preferenceSnapshot(existing) };
}
export function confirmedPreferences(existing: Preferences, updates: Preferences, timestamp: string): Preferences {
  const merged = preferenceSnapshot({ ...existing, ...preferenceSnapshot(updates) });
  return { ...merged, isConfirmed: true, confirmedAt: timestamp, lastConfirmedPreferences: merged };
}
export function samePreferences(current: Preferences, baseline: Preferences): boolean {
  const keys = Object.keys(preferenceSnapshot(current)).sort();
  return keys.every(key => JSON.stringify(current[key]) === JSON.stringify(baseline[key]));
}
