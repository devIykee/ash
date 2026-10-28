import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { TypeIcon } from "./icons";
import { StatusPill } from "./status-pill";

export type RecordRowData = {
  href: string;
  title: string;
  type: string;
  sub?: ReactNode;
  state?: string;
  end?: ReactNode;
};

// A compact, scannable list of records: icon, title, detail line, status.
export function RecordList({ rows, label }: { rows: RecordRowData[]; label?: string }) {
  return (
    <div className="list" role="list" aria-label={label}>
      {rows.map((row) => (
        <Link className="list-row" href={row.href} key={row.href} role="listitem">
          <span className="row-icon" aria-hidden="true">
            <TypeIcon type={row.type} />
          </span>
          <span className="row-main">
            <span className="row-title">{row.title}</span>
            {row.sub ? <span className="row-sub">{row.sub}</span> : null}
          </span>
          <span className="row-end">
            {row.end}
            {row.state ? <StatusPill value={row.state} /> : null}
          </span>
          <ChevronRight className="row-chev" size={18} aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
}
