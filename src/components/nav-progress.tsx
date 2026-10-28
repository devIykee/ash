"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// A thin bar at the top of the window while the next page loads.
// It starts on an internal link click and finishes when the path changes.
export function NavProgress() {
  const pathname = usePathname();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const timers = useRef<number[]>([]);

  function clear() {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("zcash:") || href.startsWith("mailto:")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      clear();
      setState("loading");
      // Give up quietly if the navigation never completes.
      timers.current.push(window.setTimeout(() => setState("idle"), 12_000));
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    setState((current) => {
      if (current !== "loading") return current;
      clear();
      timers.current.push(window.setTimeout(() => setState("idle"), 320));
      return "done";
    });
  }, [pathname]);

  useEffect(() => clear, []);

  return <div className="nav-progress" data-state={state} aria-hidden="true" />;
}
