/** Categories group career pages on the Career pages screen, such as "IT companies" or "Banks". */
export const MAX_CATEGORY_LENGTH = 60;
export const NO_CATEGORY = 'No category';

/** Tidies what was typed: trims, collapses spaces, and turns a blank into no category. */
export function cleanCategory(input: string | null | undefined): string | null {
  const s = (input ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_CATEGORY_LENGTH);
  return s || null;
}

/** Reuses an existing category's spelling when the typed one differs only in case, so "banks" joins "Banks". */
export function resolveCategory(input: string | null | undefined, existing: string[]): string | null {
  const s = cleanCategory(input);
  if (!s) return null;
  return existing.find((c) => c.toLowerCase() === s.toLowerCase()) ?? s;
}

/** Moves one id to position `to` (0 is first), keeping the others in order. Out-of-range positions stop at the ends. */
export function moveId(order: string[], id: string, to: number): string[] {
  const rest = order.filter((x) => x !== id);
  const at = Math.max(0, Math.min(to, rest.length));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/** Groups pages by category, A to Z, with uncategorised pages last. Order inside each group is kept. */
export function groupByCategory<T extends { category: string | null }>(pages: T[]): { category: string | null; pages: T[] }[] {
  const groups = new Map<string | null, T[]>();
  for (const p of pages) {
    const key = cleanCategory(p.category);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b, undefined, { sensitivity: 'base' })))
    .map(([category, pages]) => ({ category, pages }));
}
