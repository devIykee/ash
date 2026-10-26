import Link from "next/link";

export default function NotFound() {
  return (
    <div className="stack">
      <h1>Not found</h1>
      <p>That record is missing, or you are not a participant.</p>
      <Link href="/">Back to the overview</Link>
    </div>
  );
}
