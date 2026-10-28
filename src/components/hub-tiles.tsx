import { ArrowRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

export type HubTile = { href: string; title: string; body: string; icon: LucideIcon; tone?: "warm" | "info" };

export function HubTiles({ tiles }: { tiles: HubTile[] }) {
  return (
    <div className="tiles">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <Link className="tile" key={tile.href} href={tile.href} data-tone={tile.tone}>
            <span className="tile-icon" aria-hidden="true">
              <Icon size={19} />
            </span>
            <strong>
              {tile.title} <ArrowRight size={14} aria-hidden="true" style={{ verticalAlign: "-0.1em", opacity: 0.55 }} />
            </strong>
            <span>{tile.body}</span>
          </Link>
        );
      })}
    </div>
  );
}
