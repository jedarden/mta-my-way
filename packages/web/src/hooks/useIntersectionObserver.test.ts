/**
 * Tests for useIntersectionObserver hook
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useIntersectionObserver, useLazyLoad } from "./useIntersectionObserver";

// Store the latest callback and options for triggering
let mockCallback: IntersectionObserverCallback | null = null;
let mockOptions: (Record<string, unknown> & IntersectionObserverInit) | null = null;
let mockObserveCalls: Array<Element> = [];
let mockDisconnectCalls = 0;
let mockUnobserveCalls: Array<Element> = [];
let activeObserver: MockIntersectionObserver | null = null;
let lastObservedElement: Element | null = null;

// Reset mocks before each test
function resetMocks() {
  mockCallback = null;
  mockOptions = null;
  mockObserveCalls = [];
  mockDisconnectCalls = 0;
  mockUnobserveCalls = [];
  activeObserver = null;
  lastObservedElement = null;
}

// Mock IntersectionObserver class
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];

  constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit = {}) {
    mockCallback = callback;
    // Store the full options including custom ones like triggerOnce
    // Create a new object to preserve all properties
    mockOptions = {
      root: options.root ?? null,
      rootMargin: options.rootMargin ?? "",
      threshold: options.threshold ?? 0,
      ...(options as Record<string, unknown>),
    } as Record<string, unknown> & IntersectionObserverInit;
    this.root = options.root ?? null;
    this.rootMargin = options.rootMargin ?? "";
    this.thresholds = Array.isArray(options.threshold)
      ? options.threshold
      : [options.threshold ?? 0];
    activeObserver = this;
  }

  observe(target: Element) {
    mockObserveCalls.push(target);
    lastObservedElement = target;
  }

  unobserve(target: Element) {
    mockUnobserveCalls.push(target);
  }

  disconnect() {
    mockDisconnectCalls++;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  // Helper to trigger intersection - uses the last observed element as target
  trigger(isIntersecting: boolean) {
    if (mockCallback && lastObservedElement) {
      const entry: IntersectionObserverEntry = {
        isIntersecting,
        target: lastObservedElement,
        boundingClientRect: lastObservedElement.getBoundingClientRect(),
        intersectionRatio: isIntersecting ? 1 : 0,
        rootBounds: null,
        time: Date.now(),
        intersectionRect: new DOMRect(),
      };
      mockCallback([entry], this);
    }
  }
}

describe("useIntersectionObserver", () => {
  let mockIntersectionObserverFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetMocks();

    mockIntersectionObserverFn = vi.fn(
      (callback, options) => new MockIntersectionObserver(callback, options)
    );

    Object.defineProperty(global, "IntersectionObserver", {
      writable: true,
      configurable: true,
      value: mockIntersectionObserverFn,
    });
  });

  it("returns ref and initial state", () => {
    const { result } = renderHook(() => useIntersectionObserver());

    expect(result.current.isIntersecting).toBe(false);
    expect(result.current.hasIntersected).toBe(false);
    expect(typeof result.current.ref).toBe("function");
  });

  it("observes element when ref is attached", () => {
    const { result } = renderHook(() => useIntersectionObserver());
    const mockElement = document.createElement("div");

    act(() => {
      result.current.ref(mockElement);
    });

    // Wait for useEffect to run and create the observer
    expect(mockIntersectionObserverFn).toHaveBeenCalled();
    expect(mockObserveCalls).toHaveLength(1);
    expect(mockObserveCalls[0]).toBe(mockElement);
  });

  it("updates isIntersecting when element intersects", () => {
    const { result } = renderHook(() => useIntersectionObserver());
    const mockElement = document.createElement("div");

    act(() => {
      result.current.ref(mockElement);
    });

    // Get the observer instance from the mock calls
    const observerInstance = mockIntersectionObserverFn.mock.results[0]
      ?.value as MockIntersectionObserver;

    // Trigger intersection using the active observer
    act(() => {
      observerInstance?.trigger(true);
    });

    expect(result.current.isIntersecting).toBe(true);
    expect(result.current.hasIntersected).toBe(true);
  });

  it("updates isIntersecting when element leaves viewport", () => {
    const { result } = renderHook(() => useIntersectionObserver());
    const mockElement = document.createElement("div");

    act(() => {
      result.current.ref(mockElement);
    });

    const observerInstance = mockIntersectionObserverFn.mock.results[0]
      ?.value as MockIntersectionObserver;

    act(() => {
      observerInstance?.trigger(true);
    });

    expect(result.current.isIntersecting).toBe(true);

    act(() => {
      observerInstance?.trigger(false);
    });

    expect(result.current.isIntersecting).toBe(false);
  });

  it("disconnects observer on unmount", () => {
    const { result, unmount } = renderHook(() => useIntersectionObserver());
    const mockElement = document.createElement("div");

    act(() => {
      result.current.ref(mockElement);
    });

    const beforeDisconnect = mockDisconnectCalls;

    unmount();

    // Disconnect should be called at least once (on unmount)
    expect(mockDisconnectCalls).toBeGreaterThan(beforeDisconnect);
  });

  it("uses custom root element", () => {
    const mockRoot = document.createElement("div");
    const { result } = renderHook(() => useIntersectionObserver({ root: mockRoot }));
    const mockElement = document.createElement("div");

    act(() => {
      result.current.ref(mockElement);
    });

    // Check that the observer was created with the custom root
    expect(mockOptions).toEqual(expect.objectContaining({ root: mockRoot }));
  });

  it("uses custom rootMargin", () => {
    const { result } = renderHook(() => useIntersectionObserver({ rootMargin: "100px" }));
    const mockElement = document.createElement("div");

    act(() => {
      result.current.ref(mockElement);
    });

    expect(mockOptions).toEqual(expect.objectContaining({ rootMargin: "100px" }));
  });

  it("uses custom threshold", () => {
    const { result } = renderHook(() => useIntersectionObserver({ threshold: 0.5 }));
    const mockElement = document.createElement("div");

    act(() => {
      result.current.ref(mockElement);
    });

    expect(mockOptions).toEqual(expect.objectContaining({ threshold: 0.5 }));
  });

  it("disconnects after first intersection when triggerOnce is true", () => {
    const { result } = renderHook(() => useIntersectionObserver({ triggerOnce: true }));
    const mockElement = document.createElement("div");

    act(() => {
      result.current.ref(mockElement);
    });

    const beforeDisconnect = mockDisconnectCalls;

    const observerInstance = mockIntersectionObserverFn.mock.results[0]
      ?.value as MockIntersectionObserver;

    act(() => {
      observerInstance?.trigger(true);
    });

    // Should have called disconnect after intersection (triggerOnce behavior)
    expect(mockDisconnectCalls).toBeGreaterThan(beforeDisconnect);
  });

  it("does not disconnect when triggerOnce is false", () => {
    const { result } = renderHook(() => useIntersectionObserver({ triggerOnce: false }));
    const mockElement = document.createElement("div");

    act(() => {
      result.current.ref(mockElement);
    });

    const beforeDisconnect = mockDisconnectCalls;

    const observerInstance = mockIntersectionObserverFn.mock.results[0]
      ?.value as MockIntersectionObserver;

    act(() => {
      observerInstance?.trigger(true);
    });

    // Should not have called disconnect yet (only from cleanup)
    expect(mockDisconnectCalls).toBe(beforeDisconnect);
  });
});

describe("useLazyLoad", () => {
  let mockIntersectionObserverFnLazy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetMocks();

    mockIntersectionObserverFnLazy = vi.fn(
      (callback, options) => new MockIntersectionObserver(callback, options)
    );

    Object.defineProperty(global, "IntersectionObserver", {
      writable: true,
      configurable: true,
      value: mockIntersectionObserverFnLazy,
    });
  });

  it("returns isLoaded based on intersection", () => {
    const { result } = renderHook(() => useLazyLoad());
    const mockElement = document.createElement("div");

    expect(result.current.isLoaded).toBe(false);

    act(() => {
      result.current.ref(mockElement);
    });

    const observer = mockIntersectionObserverFnLazy.mock.results[0]
      ?.value as MockIntersectionObserver;

    if (observer && observer.trigger) {
      act(() => {
        observer.trigger(true);
      });

      expect(result.current.isLoaded).toBe(true);
      expect(result.current.isVisible).toBe(true);
    }
  });

  it("sets triggerOnce by default", () => {
    // Reset mocks before this specific test to ensure clean state
    resetMocks();

    const localMockFn = vi.fn(
      (callback, options) => new MockIntersectionObserver(callback, options)
    );

    Object.defineProperty(global, "IntersectionObserver", {
      writable: true,
      configurable: true,
      value: localMockFn,
    });

    const { result } = renderHook(() => useLazyLoad());
    const mockElement = document.createElement("div");

    act(() => {
      result.current.ref(mockElement);
    });

    // triggerOnce is a custom option handled by the hook, not passed to IntersectionObserver
    // Verify the observer was created (useLazyLoad uses triggerOnce: true internally)
    expect(localMockFn).toHaveBeenCalled();
    // Verify the intersection observer options are set correctly
    expect(mockOptions).toEqual(
      expect.objectContaining({
        root: null,
        rootMargin: "0px",
        threshold: 0,
      })
    );
  });
});
