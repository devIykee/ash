import { MemoStudio } from "@/components/memo-studio";

export default function MemoPage() {
  return (
    <div className="stack">
      <p className="kicker">Memo linter</p>
      <h1>Check a memo before you send it</h1>
      <p className="lede">Analysis runs in this browser. Nothing in the memo field is posted unless you explicitly record counts, and that request has no memo field.</p>
      <MemoStudio />
    </div>
  );
}
