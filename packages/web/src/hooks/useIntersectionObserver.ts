/**
 * useIntersectionObserver - Hook for lazy loading and viewport detection.
 *
 * Per plan.md Phase 4: Performance optimization.
 *
 * Features:
 *   - Detects when elements enter/leave the viewport
 *   - Useful for lazy loading images, infinite scroll, analytics
 *   - Uses native IntersectionObserver API for performance
 */

import { useEffect, useRef, useState } from "react";

interface UseIntersectionObserverOptions {
  /** Root element to use as viewport (default: browser viewport) */
  root?: Element | null;
  /** Margin around the root element (default: "0px") */
  rootMargin?: string;
  /** Percentage of element visibility required to trigger (default: 0) */
  threshold?: number | number[];
  /** Whether to disconnect the observer after first intersection (default: false) */
  triggerOnce?: boolean;
}

interface IntersectionResult {
  /** Ref to attach to the target element */
  ref: (node: Element | null) => void;
  /** Whether the element is currently intersecting */
  isIntersecting: boolean;
  /** Whether the element has ever intersected */
  hasIntersected: boolean;
}

/**
 * useIntersectionObserver - Hook for detecting element visibility
 *
 * Usage:
 *   const { ref, isIntersecting } = useIntersectionObserver();
 *   <div ref={ref}>{isIntersecting ? "Visible!" : "Not visible"}</div>
 */
export function useIntersectionObserver(
  options: UseIntersectionObserverOptions = {}
): IntersectionResult {
  const { root = null, rootMargin = "0px", threshold = 0, triggerOnce = false } = options;

  const [isIntersecting, setIsIntersecting] = useState(false);
  const [hasIntersected, setHasIntersected] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const elementRef = useRef<Element | null>(null);

  const setRef = useRef((node: Element | null) => {
    elementRef.current = node;
  }).current;

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // Disconnect previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        const isElementIntersecting = entry.isIntersecting;

        setIsIntersecting(isElementIntersecting);

        if (isElementIntersecting && !hasIntersected) {
          setHasIntersected(true);
        }

        // Disconnect if triggerOnce and element has intersected
        if (triggerOnce && isElementIntersecting) {
          observer.disconnect();
          observerRef.current = null;
        }
      },
      { root, rootMargin, threshold }
    );

    observer.observe(element);
    observerRef.current = observer;

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [root, rootMargin, threshold, triggerOnce, hasIntersected]);

  return { ref: setRef, isIntersecting, hasIntersected };
}

/**
 * useLazyLoad - Hook for lazy loading content when element becomes visible
 *
 * Usage:
 *   const { ref, isLoaded } = useLazyLoad();
 *   <div ref={ref}>{isLoaded ? <HeavyComponent /> : <Skeleton />}</div>
 */
export function useLazyLoad(options?: UseIntersectionObserverOptions) {
  const { isIntersecting, hasIntersected, ref } = useIntersectionObserver({
    triggerOnce: true,
    ...options,
  });

  return {
    ref,
    isLoaded: hasIntersected,
    isVisible: isIntersecting,
  };
}

export default useIntersectionObserver;
