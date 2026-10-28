"use client";

import { storage } from "@/client/storage";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { getGuide, type Guide } from "@/guides/catalog";

type GuideContextValue = {
  start: (id: string, step?: number) => void;
  restart: (id: string) => void;
  restartWelcome: () => void;
};

const GuideContext = createContext<GuideContextValue | null>(null);

export function useGuide(): GuideContextValue {
  const value = useContext(GuideContext);
  if (!value) throw new Error("Guide controls must render inside the workspace.");
  return value;
}

export function GuideStart({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const { start } = useGuide();
  return (
    <button className={className ?? "button quiet small"} type="button" onClick={() => start(id, 0)}>
      {children}
    </button>
  );
}

export function GuideProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [guide, setGuide] = useState<Guide | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [welcome, setWelcome] = useState(false);
  const [target, setTarget] = useState<DOMRect | null>(null);
  const [narrow, setNarrow] = useState(false);
  const titleId = useId();

  function start(id: string, step = 0) {
    const next = getGuide(id);
    if (!next) return;
    const saved = step === 0 ? savedStep(id) : null;
    setGuide(next);
    setStepIndex(Math.min(saved ?? step, next.steps.length - 1));
    setWelcome(false);
  }

  function restart(id: string) {
    storage.remove(`ash.guide.${id}`);
    if (id === "orient") storage.set("ash.welcome", "toured");
    const next = getGuide(id);
    if (!next) return;
    setGuide(next);
    setStepIndex(0);
    setWelcome(false);
  }

  function closeGuide() {
    setGuide(null);
    setTarget(null);
  }

  function restartWelcome() {
    storage.remove("ash.welcome");
    setGuide(null);
    if (pathname === "/workspace") setWelcome(true);
    else router.push("/workspace");
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("guide");
    if (requested && getGuide(requested)) {
      const requestedStep = Number(params.get("step") || "0");
      const next = getGuide(requested);
      if (next) {
        setGuide(next);
        setStepIndex(Math.min(Number.isInteger(requestedStep) ? requestedStep : 0, next.steps.length - 1));
        setWelcome(false);
      }
      params.delete("guide");
      params.delete("step");
      const query = params.toString();
      window.history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
    } else if (pathname === "/workspace" && !storage.get("ash.welcome")) {
      setWelcome(true);
    }
    const media = window.matchMedia("(max-width: 760px)");
    const apply = () => setNarrow(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [pathname]);

  const step = guide?.steps[stepIndex];

  useEffect(() => {
    if (!guide || !step?.target || (step.href && pathname !== step.href)) {
      setTarget(null);
      return;
    }
    const node = document.querySelector<HTMLElement>(`[data-guide="${step.target}"]`);
    if (!node || node.getClientRects().length === 0) {
      setTarget(null);
      return;
    }
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ block: "center", behavior: motion ? "auto" : "smooth" });
    const update = () => {
      const rect = node.getBoundingClientRect();
      setTarget(rect.width === 0 && rect.height === 0 ? null : rect);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [guide, step, pathname, stepIndex]);

  useEffect(() => {
    if (!guide) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeGuide();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [guide]);

  function remember(index: number | "done") {
    if (guide) storage.set(`ash.guide.${guide.id}`, String(index));
  }

  function go(next: number) {
    if (!guide) return;
    if (next >= guide.steps.length) {
      remember("done");
      closeGuide();
      return;
    }
    remember(next);
    setStepIndex(next);
  }

  function primary() {
    if (!step) return;
    if (step.href && pathname !== step.href) {
      router.push(step.href);
      return;
    }
    go(stepIndex + 1);
  }

  const away = Boolean(step?.href && pathname !== step.href);

  return (
    <GuideContext.Provider value={{ start, restart, restartWelcome }}>
      {children}
      {welcome ? (
        <WelcomeDialog
          onTour={() => {
            storage.set("ash.welcome", "toured");
            start("orient", 0);
          }}
          onClose={() => {
            storage.set("ash.welcome", "dismissed");
            setWelcome(false);
          }}
        />
      ) : null}
      {guide && step ? (
        <>
          {target && !narrow ? (
            <div className="spot-ring" style={{ top: target.top - 6, left: target.left - 6, width: target.width + 12, height: target.height + 12 }} />
          ) : null}
          <section className="guide-card" style={cardPosition(target, narrow)} role="dialog" aria-modal="false" aria-labelledby={titleId}>
            <p className="step-count">
              Step {stepIndex + 1} of {guide.steps.length}
            </p>
            <h2 id={titleId}>{step.title}</h2>
            <p>{step.body}</p>
            <p className="sr-only" aria-live="polite">
              Step {stepIndex + 1} of {guide.steps.length}. {step.title}
            </p>
            {!target && !away ? <p className="muted">That control is not on this screen. You can continue, or open the page where it appears.</p> : null}
            <div className="row">
              <button type="button" onClick={primary}>
                {away ? "Go to this step" : stepIndex === guide.steps.length - 1 ? "Finish" : "Next"}
              </button>
              {stepIndex > 0 ? (
                <button className="quiet" type="button" onClick={() => go(stepIndex - 1)}>
                  Back
                </button>
              ) : null}
              <button className="quiet" type="button" onClick={closeGuide}>
                Exit
              </button>
            </div>
            {!target && step.fallbackHref ? (
              <button className="quiet" type="button" onClick={() => router.push(step.fallbackHref || "/workspace")}>
                {step.fallbackLabel ?? "Open the related page"}
              </button>
            ) : null}
          </section>
        </>
      ) : null}
    </GuideContext.Provider>
  );
}

function savedStep(id: string): number | null {
  const raw = storage.get(`ash.guide.${id}`);
  if (!raw || raw === "done") return null;
  const step = Number(raw);
  return Number.isInteger(step) && step >= 0 ? step : null;
}

function cardPosition(target: DOMRect | null, narrow: boolean): { top: number; left: number } | undefined {
  if (narrow || typeof window === "undefined") return undefined;
  const width = 360;
  if (!target) return { top: 96, left: Math.max(16, window.innerWidth - width - 24) };
  let top = target.bottom + 12;
  let left = target.left;
  if (top > window.innerHeight - 240) top = Math.max(12, target.top - 240);
  if (left + width > window.innerWidth - 12) left = Math.max(12, window.innerWidth - width - 12);
  return { top, left };
}

function WelcomeDialog({ onTour, onClose }: { onTour: () => void; onClose: () => void }) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const items = () =>
      [...(node?.querySelectorAll<HTMLElement>("button") ?? [])].filter((item) => !item.hasAttribute("disabled"));
    items()[0]?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = items();
      if (buttons.length === 0) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="modal-back">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <header>
          <p className="kicker">Welcome</p>
          <button className="icon-x" type="button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        <h2 id={titleId}>Pay someone privately, then keep a receipt.</h2>
        <p>You can pay people, send a locked file, or show one payment to a reviewer. They only see that.</p>
        <p className="muted">Pick a demo person in the account menu. A guide never sends a payment for you.</p>
        <div className="row">
          <button type="button" onClick={onTour}>
            Take a quick tour
          </button>
          <button className="quiet" type="button" onClick={onClose}>
            Go to my workspace
          </button>
        </div>
      </div>
    </div>
  );
}
