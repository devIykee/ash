import { CircleHelp, Eye, Info, RotateCcw, ShieldCheck, Wallet, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      {eyebrow ? <p className="kicker">{eyebrow}</p> : null}
      <div className="page-head-row">
        <h1>{title}</h1>
        {actions}
      </div>
      {lede ? <p className="lede">{lede}</p> : null}
    </header>
  );
}

// Picks an icon from the wording of a fact title, so callers stay simple.
function factIcon(title: string): LucideIcon {
  const text = title.toLowerCase();
  if (/see|stor|show/.test(text)) return Eye;
  if (/undo|cancel|fail|if /.test(text)) return RotateCcw;
  if (/pay|price|confirm|cost/.test(text)) return Wallet;
  if (/secret|limit|private|key/.test(text)) return ShieldCheck;
  if (/need|before|next/.test(text)) return Info;
  return CircleHelp;
}

export function ConsequenceList({ items }: { items: { title: string; body: string }[] }) {
  return (
    <dl className="consequences">
      {items.map((item) => {
        const Icon = factIcon(item.title);
        return (
          <div key={item.title}>
            <Icon className="fact-icon" size={18} aria-hidden="true" />
            <dt>{item.title}</dt>
            <dd>{item.body}</dd>
          </div>
        );
      })}
    </dl>
  );
}
