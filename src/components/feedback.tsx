'use client';
import { Check, Info, LoaderCircle, X } from 'lucide-react';
import { createContext, useCallback, useContext, useId, useRef, useState, type ReactNode } from 'react';

type Tone = 'ok' | 'bad' | 'info';
type Item = { id: number; tone: Tone; text: string };

const Ctx = createContext<(tone: Tone, text: string) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const seq = useRef(0);
  const push = useCallback((tone: Tone, text: string) => {
    const id = ++seq.current;
    setItems((x) => [...x.slice(-2), { id, tone, text }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), tone === 'bad' ? 9000 : 6000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => {
          const Icon = t.tone === 'ok' ? Check : t.tone === 'bad' ? X : Info;
          return <div key={t.id} className="toast"><Icon size={18} aria-hidden="true" /><span>{t.text}</span></div>;
        })}
      </div>
    </Ctx.Provider>
  );
}

/** Opens a native modal dialog, so focus, Escape and the backdrop all behave properly. */
export function useDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  return { ref, open: () => ref.current?.showModal(), close: () => ref.current?.close() };
}

/** Anything that deletes something goes through here: one more step, stated in plain words. */
export function ConfirmButton({ className, label, children, title, body, confirm, onConfirm }: {
  className: string; label?: string; children: ReactNode; title: string; body: ReactNode; confirm: string; onConfirm: () => Promise<void>;
}) {
  const { ref, open, close } = useDialog();
  const heading = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <button type="button" className={className} aria-label={label} title={label} onClick={() => { setError(''); open(); }}>{children}</button>
      <dialog ref={ref} className="sheet" aria-labelledby={heading}>
        <h2 id={heading} className="text-[1.25rem]">{title}</h2>
        <div className="mt-2 text-soft">{body}</div>
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-stop-strong">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn btn-quiet" onClick={close}>Cancel</button>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={async () => {
            setBusy(true); setError('');
            try { await onConfirm(); close(); }
            catch (e) { setError(e instanceof Error ? e.message : 'That did not work. Try again.'); }
            setBusy(false);
          }}>{busy && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}{confirm}</button>
        </div>
      </dialog>
    </>
  );
}
