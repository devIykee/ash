"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("ash_page_error", error.digest ?? error.name);
  }, [error]);
  return (
    <div className="stack empty">
      <p className="kicker">Something went wrong</p>
      <h1>This page could not load</h1>
      <p className="lede">Nothing was sent or charged by opening it. Try again, or go back to your workspace.</p>
      {error.digest ? <p className="mono muted">Reference {error.digest}</p> : null}
      <div className="row">
        <button type="button" onClick={reset}>
          Try again
        </button>
        <Link className="button quiet" href="/workspace">
          Go to workspace
        </Link>
      </div>
    </div>
  );
}
