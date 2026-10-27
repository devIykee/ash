import Link from "next/link";

export default function NotFound() {
  return (
    <div className="stack">
      <h1>That page is not available</h1>
      <p>The record is missing, or you are not one of the people on it.</p>
      <div className="row">
        <Link className="button" href="/workspace">
          Go to the workspace
        </Link>
        <Link className="button quiet" href="/">
          Back to ASH
        </Link>
      </div>
    </div>
  );
}
