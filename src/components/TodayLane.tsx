'use client';
import { Check, ChevronRight, LoaderCircle, Minus, X } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Switch, useSetting } from './controls';

export type Slot = { key: string; field: string; label: string; enabled: boolean; position: number; result: string | null; passed: boolean };

const STATE: Record<string, string> = { completed: 'Searched', partial: 'Partly searched', failed: 'Failed', missed: 'Missed', running: 'Running', cancelled: 'Cancelled' };

function Stop({ slot, agentOn }: { slot: Slot; agentOn: boolean }) {
  const { value, set } = useSetting(slot.enabled, slot.field);
  const live = agentOn && value;
  const done = slot.result === 'completed' || slot.result === 'partial';
  const bad = slot.result === 'failed' || slot.result === 'missed';
  const busy = slot.result === 'running';
  const marker = done ? 'is-done' : bad ? 'is-bad' : busy ? 'is-busy' : live ? '' : 'is-off';
  const text = (slot.result && STATE[slot.result]) ?? (slot.passed ? 'No search' : live ? 'Scheduled' : 'Off');
  return (
    <li className={`lane-stop ${live ? '' : 'is-disabled'}`} style={{ '--pos': `${slot.position}%` } as CSSProperties}>
      <span className={`lane-marker ${marker}`}>
        {done ? <Check size={20} strokeWidth={3} aria-hidden="true" /> : bad ? <X size={20} strokeWidth={3} aria-hidden="true" /> : busy ? <LoaderCircle size={20} className="animate-spin" aria-hidden="true" /> : live ? <ChevronRight size={22} strokeWidth={3} aria-hidden="true" /> : <Minus size={18} aria-hidden="true" />}
      </span>
      <span className="lane-time">{slot.label}</span>
      <span className="lane-state">{text}</span>
      <Switch checked={value} onChange={set} label={`${slot.label} search`} disabled={!agentOn} />
    </li>
  );
}

/** The agent's working day, drawn as the thing it is: a road with three stops on it. */
export function TodayLane({ slots, agentOn, now }: { slots: Slot[]; agentOn: boolean; now: number }) {
  const clear = slots.every((s) => Math.abs(s.position - now) > 5);
  return (
    <div className="lane" style={{ '--now': `${now}%` } as CSSProperties}>
      <div className="lane-road" aria-hidden="true" />
      {agentOn && <span className="lane-travelled" aria-hidden="true" />}
      {agentOn && clear && <span className="lane-now" aria-hidden="true">Now</span>}
      <ol className="lane-stops">{slots.map((s) => <Stop key={s.key} slot={s} agentOn={agentOn} />)}</ol>
    </div>
  );
}
