import { stateLabel } from "./labels";

export function StatusPill({ value }: { value: string }) {
  return (
    <span className="pill" data-state={value}>
      <span className="sr-only">Status: </span>
      {stateLabel(value)}
    </span>
  );
}
