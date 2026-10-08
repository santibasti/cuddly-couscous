// A collapsible section: the one-line summary stays visible, the detail opens on tap. Keeps a job page focused on the current step.
import type { ReactNode } from 'react';

export function Fold({ title, hint, open, children }: { title: ReactNode; hint?: ReactNode; open?: boolean; children: ReactNode }) {
  return (
    <details className="fold card" open={open}>
      <summary><b>{title}</b>{hint ? <span className="small muted">{hint}</span> : null}<span className="fold-chev" aria-hidden>▾</span></summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}
