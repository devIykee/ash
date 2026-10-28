import { Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({ title, body, action, icon: Icon = Inbox }: { title: string; body: string; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="empty">
      <span className="empty-icon" aria-hidden="true">
        <Icon size={20} />
      </span>
      <h2>{title}</h2>
      <p className="muted measure">{body}</p>
      {action}
    </div>
  );
}
