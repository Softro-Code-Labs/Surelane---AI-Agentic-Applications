// Sri Lanka has no daylight saving, so +05:30 is exact all year.
export const TZ = 'Asia/Colombo';
export const RETENTION_DAYS = 30;
/** A slot may start this long after its time, to absorb a late trigger. */
export const SLOT_GRACE_MIN = 120;
export const CLEANUP_TIME = '03:00';

export type SlotKey = 'morning' | 'midday' | 'evening';
export type ScheduleSettings = {
  agent_enabled: boolean;
  slot_morning: boolean;
  slot_midday: boolean;
  slot_evening: boolean;
  schedule_changed_at?: Date | string;
};

export const SLOTS: { key: SlotKey; time: string; label: string; field: keyof ScheduleSettings }[] = [
  { key: 'morning', time: '08:00', label: '8:00 AM', field: 'slot_morning' },
  { key: 'midday', time: '12:30', label: '12:30 PM', field: 'slot_midday' },
  { key: 'evening', time: '17:00', label: '5:00 PM', field: 'slot_evening' },
];

export function colomboDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function atColombo(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+05:30`);
}

function addDays(date: string, n: number): string {
  return colomboDate(new Date(atColombo(date, '12:00').getTime() + n * 86_400_000));
}

export function isSlotEnabled(s: ScheduleSettings, key: SlotKey): boolean {
  return Boolean(s[SLOTS.find((x) => x.key === key)!.field]);
}

/** Slots whose start time has passed, still inside the grace window, and switched on. */
export function dueSlots(now: Date, s: ScheduleSettings): { key: SlotKey; date: string; at: Date }[] {
  if (!s.agent_enabled) return [];
  const date = colomboDate(now);
  return SLOTS.flatMap((slot) => {
    const at = atColombo(date, slot.time);
    const open = now >= at && now.getTime() < at.getTime() + SLOT_GRACE_MIN * 60_000;
    return open && isSlotEnabled(s, slot.key) ? [{ key: slot.key, date, at }] : [];
  });
}

/**
 * Today's slots that closed without any run. A slot only counts if it was on
 * throughout: switching the agent or a slot on later must not report a miss.
 */
export function closedSlots(now: Date, s: ScheduleSettings): { key: SlotKey; date: string; at: Date }[] {
  if (!s.agent_enabled) return [];
  const date = colomboDate(now);
  const changed = s.schedule_changed_at ? new Date(s.schedule_changed_at).getTime() : 0;
  return SLOTS.flatMap((slot) => {
    const at = atColombo(date, slot.time);
    const closed = now.getTime() >= at.getTime() + SLOT_GRACE_MIN * 60_000;
    return closed && isSlotEnabled(s, slot.key) && changed <= at.getTime() ? [{ key: slot.key, date, at }] : [];
  });
}

export function nextSlot(now: Date, s: ScheduleSettings): { key: SlotKey; at: Date; label: string } | null {
  if (!s.agent_enabled) return null;
  const today = colomboDate(now);
  for (let i = 0; i < 2; i++) {
    const date = addDays(today, i);
    for (const slot of SLOTS) {
      const at = atColombo(date, slot.time);
      if (at > now && isSlotEnabled(s, slot.key)) return { key: slot.key, at, label: slot.label };
    }
  }
  return null;
}

export function nextCleanup(now: Date): Date {
  const today = colomboDate(now);
  const at = atColombo(today, CLEANUP_TIME);
  return at > now ? at : atColombo(addDays(today, 1), CLEANUP_TIME);
}

/** The most recent 03:00 Colombo time at or before `now`. */
export function lastCleanupMark(now: Date): Date {
  const today = colomboDate(now);
  const at = atColombo(today, CLEANUP_TIME);
  return at <= now ? at : atColombo(addDays(today, -1), CLEANUP_TIME);
}

export function retentionCutoff(now: Date): Date {
  return new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
}

export function formatColombo(d: Date | string | null | undefined, style: 'datetime' | 'date' | 'time' = 'datetime'): string {
  if (!d) return '';
  const date = new Date(d);
  const opts: Intl.DateTimeFormatOptions =
    style === 'date' ? { dateStyle: 'medium' } : style === 'time' ? { timeStyle: 'short' } : { dateStyle: 'medium', timeStyle: 'short' };
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour12: true, ...opts }).format(date).replace(/\b(am|pm)\b/, (x) => x.toUpperCase()).replace(/\b0(\d:\d\d)/, '$1');
}
