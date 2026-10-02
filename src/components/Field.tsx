import type { ReactNode } from 'react';
export function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return <div className={`field ${error ? 'has-error' : ''}`}><label htmlFor={id}>{label}</label>{children}{hint && <p className="hint" id={`${id}-hint`}>{hint}</p>}{error && <p className="field-error" id={`${id}-error`}>{error}</p>}</div>;
}
export const fieldAccessibility = (id: string, error?: string, hasHint = false) => ({
  'aria-invalid': !!error,
  'aria-describedby': [hasHint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined,
});
