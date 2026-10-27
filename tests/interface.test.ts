import { describe, expect, it } from "vitest";
import { GUIDES, requiredGuideIds } from "@/guides/catalog";
import { presentError, stateLabel } from "@/components/labels";

describe("plain status language", () => {
  it("translates machine statuses without changing the input", () => {
    expect(stateLabel("pending_verification")).toBe("Checking payment");
    expect(stateLabel("confirmed")).toBe("Payment confirmed");
    expect(stateLabel("delivery_pending")).toBe("Waiting for delivery");
    expect(stateLabel("partially_completed")).toBe("Partly completed");
    expect(stateLabel("failed")).toBe("Payment failed");
    expect(stateLabel("expired")).toBe("Expired");
    expect(stateLabel("disputed")).toBe("Under review");
    expect(stateLabel("payment_verified")).toBe("Payment accepted");
    expect(stateLabel("payment_observed")).toBe("Payment seen, not confirmed");
  });

  it("hides stack traces and keeps a normal sentence", () => {
    expect(presentError(new Error("bad\n    at explode (src/file.ts:1:1)"), "We couldn't finish that.")).toBe("We couldn't finish that.");
    expect(presentError(new Error("The run changed. Reload it and try again."), "fallback")).toBe("The run changed. Reload it and try again.");
  });
});

describe("guides", () => {
  it("covers the real tasks and never claims to submit them", () => {
    for (const id of requiredGuideIds()) {
      const guide = GUIDES.find((item) => item.id === id);
      expect(guide, id).toBeTruthy();
      expect(guide?.steps.length).toBeGreaterThan(1);
      for (const step of guide?.steps ?? []) {
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.body.length).toBeGreaterThan(20);
        expect(step.body.toLowerCase()).not.toContain("automatically submit");
        expect(step.body.toLowerCase()).not.toContain("will send the payment for you");
        expect(step.body).not.toContain("Decrypt and download");
        expect(step.body).not.toContain("Refresh clock");
        expect(step.body).not.toContain("Seal evidence");
      }
    }
    const evidence = GUIDES.find((item) => item.id === "evidence");
    const seal = evidence?.steps.find((step) => step.id === "seal");
    expect(seal?.href).toBe("/operations");
    expect(seal?.body).toContain("Prepare evidence");
    expect(seal?.target).toBe("operation-list");
  });
});
