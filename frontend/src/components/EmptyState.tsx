import type { ReactNode } from 'react';

/** État vide soigné : grande icône, un titre, une explication et, si utile, une action. À utiliser à la place d'un simple paragraphe « Rien ici ». */
export default function EmptyState({ icon = '📭', title, children, action }: { icon?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state" role="status">
      <div className="empty-state-ico" aria-hidden="true">{icon}</div>
      <strong>{title}</strong>
      {children && <p className="muted">{children}</p>}
      {action && <div className="empty-state-act">{action}</div>}
    </div>
  );
}
