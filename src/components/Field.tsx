import type { ReactNode } from 'react';
export function Field({ id, label, error, hint, hintAbove=false, children }: { id: string; label: string; error?: string; hint?: string; hintAbove?:boolean; children: ReactNode }) {
  const help=hint&&<p className="hint" id={`${id}-hint`}>{hint}</p>;
  return <div className={`field ${error ? 'has-error' : ''}`}><label htmlFor={id}>{label}</label>{hintAbove&&help}{children}{!hintAbove&&help}{error && <p className="field-error" id={`${id}-error`}>{error}</p>}</div>;
}
export const fieldAccessibility = (id: string, error?: string, hasHint = false) => ({
  'aria-invalid': !!error,
  'aria-describedby': [hasHint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined,
});
