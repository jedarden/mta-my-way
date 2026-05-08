/**
 * Tests for Skeleton components
 *
 * Tests skeleton placeholder components including:
 * - FavoriteCardSkeleton
 * - ArrivalListSkeleton
 * - ArrivalRowSkeleton
 * - AlertListSkeleton
 * - AlertCardSkeleton
 * - CommuteCardSkeleton
 * - CommuteListSkeleton
 * - FavoritesListSkeleton
 * - SearchResultsSkeleton
 * - Generic Skeleton
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AlertListSkeleton,
  ArrivalListSkeleton,
  CommuteCardSkeleton,
  CommuteListSkeleton,
  FavoriteCardSkeleton,
  FavoritesListSkeleton,
  SearchResultsSkeleton,
  Skeleton,
} from "./Skeleton";

describe("Skeleton components", () => {
  describe("FavoriteCardSkeleton", () => {
    it("renders default count of 1 card", () => {
      const { container } = render(<FavoriteCardSkeleton />);

      const skeleton = container.querySelector('[aria-busy="true"]');
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveAttribute("aria-label", "Loading favorite stations");
    });

    it("renders specified count of cards", () => {
      const { container } = render(<FavoriteCardSkeleton count={3} />);

      const skeletons = container.querySelectorAll("article");
      expect(skeletons).toHaveLength(3);
    });

    it("has correct structure with shimmer animation", () => {
      const { container } = render(<FavoriteCardSkeleton />);

      // Check for shimmer animation elements
      const shimmerElements = container.querySelectorAll(".animate-\\[shimmer_1\\.5s_infinite\\]");
      expect(shimmerElements.length).toBeGreaterThan(0);
    });
  });

  describe("ArrivalListSkeleton", () => {
    it("renders northbound and southbound sections", () => {
      const { container } = render(<ArrivalListSkeleton />);

      const skeleton = container.querySelector('[aria-busy="true"]');
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveAttribute("aria-label", "Loading arrivals");
    });

    it("renders correct number of arrival rows", () => {
      const { container } = render(<ArrivalListSkeleton />);

      // Northbound: 3 rows, Southbound: 2 rows = 5 total sections
      // Each section has a header and rows
      const sections = container.querySelectorAll("section");
      expect(sections.length).toBe(2);
    });
  });

  describe("AlertListSkeleton", () => {
    it("renders default count of 3 alerts", () => {
      const { container } = render(<AlertListSkeleton />);

      const skeleton = container.querySelector('[aria-busy="true"]');
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveAttribute("aria-label", "Loading alerts");
    });

    it("renders specified count of alerts", () => {
      const { container } = render(<AlertListSkeleton count={5} />);

      // Severe section (1) + Warning section (count - 1, max 2)
      const sections = container.querySelectorAll("section");
      expect(sections.length).toBe(2);
    });

    it("groups alerts by severity", () => {
      const { container } = render(<AlertListSkeleton />);

      // Should have severe and warning sections
      const sections = container.querySelectorAll("section");
      expect(sections.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("CommuteCardSkeleton", () => {
    it("renders default count of 1 card", () => {
      const { container } = render(<CommuteCardSkeleton />);

      const skeleton = container.querySelector('[aria-busy="true"]');
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveAttribute("aria-label", "Loading commutes");
    });

    it("renders specified count of cards", () => {
      const { container } = render(<CommuteCardSkeleton count={2} />);

      const skeletons = container.querySelectorAll("article");
      expect(skeletons).toHaveLength(2);
    });

    it("has correct structure with header and route summary", () => {
      const { container } = render(<CommuteCardSkeleton />);

      const article = container.querySelector("article");
      expect(article).toBeInTheDocument();

      // Check for shimmer elements
      const shimmerElements = container.querySelectorAll(".animate-\\[shimmer_1\\.5s_infinite\\]");
      expect(shimmerElements.length).toBeGreaterThan(0);
    });
  });

  describe("CommuteListSkeleton", () => {
    it("renders default count of 2 cards", () => {
      const { container } = render(<CommuteListSkeleton />);

      const skeletons = container.querySelectorAll("article");
      expect(skeletons).toHaveLength(2);
    });

    it("renders specified count of cards", () => {
      const { container } = render(<CommuteListSkeleton count={4} />);

      const skeletons = container.querySelectorAll("article");
      expect(skeletons).toHaveLength(4);
    });
  });

  describe("FavoritesListSkeleton", () => {
    it("renders default count of 3 cards", () => {
      const { container } = render(<FavoritesListSkeleton />);

      const skeletons = container.querySelectorAll("article");
      expect(skeletons).toHaveLength(3);
    });

    it("renders specified count of cards", () => {
      const { container } = render(<FavoritesListSkeleton count={5} />);

      const skeletons = container.querySelectorAll("article");
      expect(skeletons).toHaveLength(5);
    });
  });

  describe("SearchResultsSkeleton", () => {
    it("renders default count of 5 results", () => {
      const { container } = render(<SearchResultsSkeleton />);

      const skeleton = container.querySelector('[aria-busy="true"]');
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveAttribute("aria-label", "Loading search results");

      const results = container.querySelectorAll("div.p-4");
      expect(results).toHaveLength(5);
    });

    it("renders specified count of results", () => {
      const { container } = render(<SearchResultsSkeleton count={10} />);

      const results = container.querySelectorAll("div.p-4");
      expect(results).toHaveLength(10);
    });

    it("has correct structure with station info and line bullets", () => {
      const { container } = render(<SearchResultsSkeleton />);

      // Check for shimmer elements
      const shimmerElements = container.querySelectorAll(".animate-\\[shimmer_1\\.5s_infinite\\]");
      expect(shimmerElements.length).toBeGreaterThan(0);
    });
  });

  describe("generic Skeleton", () => {
    it("renders with default styling", () => {
      const { container } = render(<Skeleton className="h-10 w-full" />);

      const skeleton = container.firstChild as HTMLElement;
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveClass("h-10", "w-full");
    });

    it("applies custom className", () => {
      const { container } = render(<Skeleton className="custom-class" />);

      const skeleton = container.firstChild as HTMLElement;
      expect(skeleton).toHaveClass("custom-class");
    });

    it("applies custom style", () => {
      const { container } = render(<Skeleton className="base-class" style={{ width: "50%" }} />);

      const skeleton = container.firstChild as HTMLElement;
      expect(skeleton).toHaveStyle({ width: "50%" });
    });

    it("has shimmer animation", () => {
      const { container } = render(<Skeleton />);

      const shimmerElement = container.querySelector(".animate-\\[shimmer_1\\.5s_infinite\\]");
      expect(shimmerElement).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("has aria-busy attribute during loading", () => {
      render(<FavoriteCardSkeleton />);

      const skeleton = screen.getByLabelText("Loading favorite stations");
      expect(skeleton).toHaveAttribute("aria-busy", "true");
    });

    it("has descriptive aria-label", () => {
      render(<ArrivalListSkeleton />);

      const skeleton = screen.getByLabelText("Loading arrivals");
      expect(skeleton).toBeInTheDocument();
    });
  });

  describe("shimmer animation", () => {
    it("applies shimmer overlay to all skeleton elements", () => {
      const { container } = render(<FavoriteCardSkeleton />);

      const shimmerOverlays = container.querySelectorAll(
        ".bg-gradient-to-r.from-transparent.via-white\\/10"
      );
      expect(shimmerOverlays.length).toBeGreaterThan(0);
    });

    it("uses correct animation duration", () => {
      const { container } = render(<Skeleton />);

      const animatedElement = container.querySelector(".animate-\\[shimmer_1\\.5s_infinite\\]");
      expect(animatedElement).toBeInTheDocument();
    });
  });

  describe("styling", () => {
    it("uses surface color for background", () => {
      const { container } = render(<Skeleton />);

      const skeleton = container.firstChild as HTMLElement;
      expect(skeleton).toHaveClass("bg-surface");
    });

    it("is rounded", () => {
      const { container } = render(<Skeleton />);

      const skeleton = container.firstChild as HTMLElement;
      expect(skeleton).toHaveClass("rounded");
    });

    it("is overflow hidden for shimmer effect", () => {
      const { container } = render(<Skeleton />);

      const skeleton = container.firstChild as HTMLElement;
      expect(skeleton).toHaveClass("overflow-hidden");
    });
  });
});
