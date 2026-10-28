// Shown instantly while a page's data loads. The header stays in place.
export default function Loading() {
  return (
    <div className="stack skeleton" role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="sk sk-kicker" />
      <div className="sk sk-title" />
      <div className="sk sk-line" />
      <div className="sk sk-line short" />
      <div className="sk sk-card" />
      <div className="sk sk-card" />
      <div className="sk sk-card short" />
    </div>
  );
}
