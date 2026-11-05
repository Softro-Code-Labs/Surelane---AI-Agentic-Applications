import { describe, expect, it } from 'vitest';
import { atColombo, closedSlots, dueSlots, lastCleanupMark, nextCleanup, nextSlot, retentionCutoff } from '@/lib/schedule';

const on = { agent_enabled: true, slot_morning: true, slot_midday: true, slot_evening: true, schedule_changed_at: '2026-01-01' };
const t = (s: string) => new Date(`2026-11-04T${s}:00+05:30`);

describe('schedule', () => {
  it('uses the new Sri Lanka times', () => {
    expect(atColombo('2026-11-04', '08:00').toISOString()).toBe('2026-11-04T02:30:00.000Z');
    expect(atColombo('2026-11-04', '12:30').toISOString()).toBe('2026-11-04T07:00:00.000Z');
    expect(atColombo('2026-11-04', '17:00').toISOString()).toBe('2026-11-04T11:30:00.000Z');
  });
  it('fires only at 8:00, 12:30 and 17:00, not at the old 12:00 and 16:00', () => {
    expect(dueSlots(t('07:59'), on)).toEqual([]);
    expect(dueSlots(t('08:00'), on).map((s) => s.key)).toEqual(['morning']);
    expect(dueSlots(t('12:00'), on)).toEqual([]);
    expect(dueSlots(t('12:30'), on).map((s) => s.key)).toEqual(['midday']);
    expect(dueSlots(t('16:00'), on)).toEqual([]);
    expect(dueSlots(t('17:00'), on).map((s) => s.key)).toEqual(['evening']);
  });
  it('tolerates a late trigger inside the grace window only', () => {
    expect(dueSlots(t('09:59'), on)).toHaveLength(1);
    expect(dueSlots(t('10:00'), on)).toHaveLength(0);
  });
  it('turns each slot off independently', () => {
    const s = { ...on, slot_midday: false };
    expect(dueSlots(t('08:10'), s)).toHaveLength(1);
    expect(dueSlots(t('12:40'), s)).toHaveLength(0);
    expect(dueSlots(t('17:10'), s)).toHaveLength(1);
    expect(nextSlot(t('09:00'), s)?.key).toBe('evening');
  });
  it('master switch stops everything', () => {
    const s = { ...on, agent_enabled: false };
    expect(dueSlots(t('08:10'), s)).toEqual([]);
    expect(nextSlot(t('07:00'), s)).toBeNull();
    expect(closedSlots(t('23:00'), s)).toEqual([]);
  });
  it('rolls to tomorrow after the last slot', () => {
    expect(nextSlot(t('18:00'), on)?.at.toISOString()).toBe('2026-11-05T02:30:00.000Z');
  });
  it('has no next slot when all three are off', () => {
    expect(nextSlot(t('07:00'), { ...on, slot_morning: false, slot_midday: false, slot_evening: false })).toBeNull();
  });
  it('does not call a slot missed if it was switched on afterwards', () => {
    expect(closedSlots(t('11:00'), on).map((s) => s.key)).toEqual(['morning']);
    expect(closedSlots(t('11:00'), { ...on, schedule_changed_at: t('09:00') })).toEqual([]);
  });
  it('schedules cleanup at 03:00 Colombo and rolls forward', () => {
    expect(nextCleanup(t('02:00')).toISOString()).toBe('2026-11-03T21:30:00.000Z');
    expect(nextCleanup(t('04:00')).toISOString()).toBe('2026-11-04T21:30:00.000Z');
    expect(lastCleanupMark(t('02:00')).toISOString()).toBe('2026-11-02T21:30:00.000Z');
  });
  it('retention is a rolling 30 × 24h window, not a calendar month', () => {
    expect(retentionCutoff(new Date('2026-03-31T10:00:00Z')).toISOString()).toBe('2026-03-01T10:00:00.000Z');
  });
});
