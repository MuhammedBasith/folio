import { describe, expect, it } from "vitest";
import { cn } from "./utils";

/**
 * Regression tests for class merging.
 *
 * These exist because of a real bug that shipped into a screenshot: the primary
 * button rendered as a black rectangle with black text, because tailwind-merge
 * classified `text-body-sm` as a colour rather than a font size, decided it
 * conflicted with `text-action-ink`, and dropped the colour.
 *
 * Nothing threw. Nothing failed to compile. The class was simply gone from the
 * DOM. That is precisely the kind of failure that needs a test, because no
 * other signal catches it.
 */

describe("cn", () => {
  it("keeps a text colour and a font size together", () => {
    // The exact combination that broke the primary button.
    const result = cn("text-action-ink", "text-body-sm");
    expect(result).toContain("text-action-ink");
    expect(result).toContain("text-body-sm");
  });

  it.each([
    ["text-ink", "text-body"],
    ["text-ink-muted", "text-caption"],
    ["text-ink-faint", "text-label"],
    ["text-status-overdue-ink", "text-metric"],
    ["text-status-paid-ink", "text-display-sm"],
    ["text-feedback-error-ink", "text-body-sm"],
    ["text-action-soft-ink", "text-display-hero"],
  ])("keeps %s alongside %s", (colour, size) => {
    const result = cn(colour, size);
    expect(result).toContain(colour);
    expect(result).toContain(size);
  });

  it("still collapses two genuinely conflicting font sizes", () => {
    const result = cn("text-body", "text-caption");
    expect(result).toBe("text-caption");
  });

  it("still collapses two genuinely conflicting text colours", () => {
    const result = cn("text-ink", "text-ink-muted");
    expect(result).toBe("text-ink-muted");
  });

  it("keeps a custom shadow alongside other utilities", () => {
    const result = cn("shadow-raised", "rounded-lg");
    expect(result).toContain("shadow-raised");
    expect(result).toContain("rounded-lg");
  });

  it("collapses two conflicting custom shadows", () => {
    expect(cn("shadow-raised", "shadow-overlay")).toBe("shadow-overlay");
  });

  it("keeps background and text colours together", () => {
    const result = cn("bg-action", "text-action-ink");
    expect(result).toContain("bg-action");
    expect(result).toContain("text-action-ink");
  });

  it("still resolves ordinary tailwind conflicts", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("rounded-sm", "rounded-lg")).toBe("rounded-lg");
  });

  it("lets a caller override a component's default colour", () => {
    // How `className` props are expected to behave at call sites.
    const result = cn("text-ink text-body-sm", "text-ink-faint");
    expect(result).toContain("text-ink-faint");
    expect(result).not.toContain("text-ink text-body");
    expect(result).toContain("text-body-sm");
  });
});
