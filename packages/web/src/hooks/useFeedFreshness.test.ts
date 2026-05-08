/**
 * Tests for useFeedFreshness hook
 */

import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { computeFeedFreshness, useFeedFreshness } from "./useFeedFreshness";

describe("useFeedFreshness", () => {
  it("returns fresh state for feed age under 15 seconds", () => {
    const { result } = renderHook(() => useFeedFreshness(10));

    expect(result.current.level).toBe("fresh");
    expect(result.current.ageSeconds).toBe(10);
    expect(result.current.isStale).toBe(false);
    expect(result.current.isOutdated).toBe(false);
    expect(result.current.textColor).toBeTruthy();
    expect(result.current.dotColor).toBeTruthy();
  });

  it("returns neutral state for feed age 15-45 seconds", () => {
    const { result } = renderHook(() => useFeedFreshness(30));

    expect(result.current.level).toBe("neutral");
    expect(result.current.ageSeconds).toBe(30);
    expect(result.current.isStale).toBe(false);
    expect(result.current.isOutdated).toBe(false);
  });

  it("returns amber state for feed age 45-90 seconds", () => {
    const { result } = renderHook(() => useFeedFreshness(60));

    expect(result.current.level).toBe("amber");
    expect(result.current.ageSeconds).toBe(60);
    expect(result.current.isStale).toBe(true);
    expect(result.current.isOutdated).toBe(false);
  });

  it("returns red state for feed age over 90 seconds", () => {
    const { result } = renderHook(() => useFeedFreshness(120));

    expect(result.current.level).toBe("red");
    expect(result.current.ageSeconds).toBe(120);
    expect(result.current.isStale).toBe(true);
    expect(result.current.isOutdated).toBe(true);
  });

  it("returns red state for feed age exactly 90 seconds", () => {
    const { result } = renderHook(() => useFeedFreshness(90));

    expect(result.current.level).toBe("red");
    expect(result.current.isStale).toBe(true);
    expect(result.current.isOutdated).toBe(true);
  });

  it("handles zero feed age", () => {
    const { result } = renderHook(() => useFeedFreshness(0));

    expect(result.current.level).toBe("fresh");
    expect(result.current.ageSeconds).toBe(0);
    expect(result.current.isStale).toBe(false);
  });

  it("includes formatted age text", () => {
    const { result } = renderHook(() => useFeedFreshness(65));

    expect(result.current.ageText).toBeTruthy();
    expect(typeof result.current.ageText).toBe("string");
  });
});

describe("computeFeedFreshness", () => {
  it("is a pure function for non-React usage", () => {
    const result = computeFeedFreshness(100);

    expect(result.level).toBe("red");
    expect(result.ageSeconds).toBe(100);
    expect(result.isStale).toBe(true);
    expect(result.isOutdated).toBe(true);
  });

  it("can be called multiple times independently", () => {
    const result1 = computeFeedFreshness(10);
    const result2 = computeFeedFreshness(50);
    const result3 = computeFeedFreshness(100);

    expect(result1.level).toBe("fresh");
    expect(result2.level).toBe("amber");
    expect(result3.level).toBe("red");
  });

  it("provides CSS colors for styling", () => {
    const fresh = computeFeedFreshness(10);
    const amber = computeFeedFreshness(60);
    const red = computeFeedFreshness(100);

    expect(fresh.textColor).toBeTruthy();
    expect(fresh.dotColor).toBeTruthy();
    expect(amber.textColor).toBeTruthy();
    expect(amber.dotColor).toBeTruthy();
    expect(red.textColor).toBeTruthy();
    expect(red.dotColor).toBeTruthy();
  });
});
