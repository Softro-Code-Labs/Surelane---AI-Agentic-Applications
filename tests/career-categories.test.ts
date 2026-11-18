import { describe, expect, it } from 'vitest';
import { cleanCategory, groupByCategory, moveId, resolveCategory } from '@/lib/career-categories';

describe('career page categories', () => {
  it('tidy what was typed, and treat a blank as no category', () => {
    expect(cleanCategory('  IT   companies ')).toBe('IT companies');
    expect(cleanCategory('   ')).toBeNull();
    expect(cleanCategory(null)).toBeNull();
    expect(cleanCategory('x'.repeat(100))).toHaveLength(60);
  });

  it('reuse an existing spelling when only the case differs', () => {
    expect(resolveCategory('banks', ['Banks', 'IT companies'])).toBe('Banks');
    expect(resolveCategory(' it COMPANIES', ['Banks', 'IT companies'])).toBe('IT companies');
    expect(resolveCategory('Telecoms', ['Banks'])).toBe('Telecoms');
    expect(resolveCategory('', ['Banks'])).toBeNull();
  });

  it('group A to Z with uncategorised pages last, keeping order inside each group', () => {
    const pages = [
      { id: 1, category: null }, { id: 2, category: 'it companies' }, { id: 3, category: 'Banks' },
      { id: 4, category: 'IT companies' }, { id: 5, category: 'Banks' }, { id: 6, category: '  ' },
    ];
    const groups = groupByCategory(pages);
    expect(groups.map((g) => [g.category, g.pages.map((p) => p.id)])).toEqual([
      ['Banks', [3, 5]], ['it companies', [2]], ['IT companies', [4]], [null, [1, 6]],
    ]);
  });
});

describe('ordering companies within a category', () => {
  it('moves one company to a new place and keeps the rest in order', () => {
    expect(moveId(['a', 'b', 'c', 'd'], 'd', 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveId(['a', 'b', 'c', 'd'], 'a', 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveId(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'b', 'c']);
  });
  it('stops at the top and bottom', () => {
    expect(moveId(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveId(['a', 'b', 'c'], 'c', 9)).toEqual(['a', 'b', 'c']);
  });
});
