import { Check, X } from "lucide-react";

export type Step = { label: string; hint?: string };

// Shows where a multi-step task stands. `current` is the index of the step in progress.
export function Stepper({ steps, current, failed = false }: { steps: Step[]; current: number; failed?: boolean }) {
  return (
    <ol className="stepper" aria-label="Progress">
      {steps.map((step, index) => {
        const state = index < current ? "done" : index === current ? (failed ? "failed" : "current") : "todo";
        return (
          <li key={step.label} data-state={state} aria-current={index === current ? "step" : undefined}>
            <span className="step-dot" aria-hidden="true">
              {state === "done" ? <Check size={13} strokeWidth={3} /> : state === "failed" ? <X size={13} strokeWidth={3} /> : index + 1}
            </span>
            <span className="step-text">
              <span className="step-label">{step.label}</span>
              {step.hint ? <span className="step-hint">{step.hint}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
