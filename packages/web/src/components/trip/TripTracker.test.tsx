/**
 * Screen reader compatibility tests for TripTracker component.
 *
 * Tests verify:
 * - Proper ARIA live regions for trip status updates
 * - Semantic structure and labels
 * - Accessible status announcements
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TripStopProgress } from "../../hooks/useTripTracker";
import { TripTracker } from "./TripTracker";

const createMockStops = (overrides?: Partial<TripStopProgress>): TripStopProgress[] => [
  {
    stopId: "001",
    stationId: "001",
    stationName: "Times Square - 42nd St",
    status: "passed",
    arrivalTime: null,
    departureTime: null,
    minutesAway: null,
    ...overrides,
  },
  {
    stopId: "002",
    stationId: "002",
    stationName: "34th St - Penn Station",
    status: "current",
    arrivalTime: null,
    departureTime: null,
    minutesAway: null,
    ...overrides,
  },
  {
    stopId: "003",
    stationId: "003",
    stationName: "23rd St",
    status: "next",
    arrivalTime: null,
    departureTime: null,
    minutesAway: 3,
    ...overrides,
  },
  {
    stopId: "004",
    stationId: "004",
    stationName: "14th St - Union Square",
    status: "upcoming",
    arrivalTime: null,
    departureTime: null,
    minutesAway: 7,
    ...overrides,
  },
  {
    stopId: "005",
    stationId: "005",
    stationName: "Astor Pl",
    status: "destination",
    arrivalTime: null,
    departureTime: null,
    minutesAway: 10,
    ...overrides,
  },
];

describe("TripTracker - Screen Reader Compatibility", () => {
  describe("ARIA Landmarks and Regions", () => {
    it("should have a region landmark with proper label", () => {
      const stops = createMockStops();
      render(
        <TripTracker
          stops={stops}
          line="N"
          destination="Astor Pl"
          minutesToDestination={10}
          isExpired={false}
        />
      );

      const region = screen.getByRole("region", { name: /trip progress/i });
      expect(region).toBeInTheDocument();
    });
  });

  describe("Live Region Announcements", () => {
    it("should have a polite live region for trip status", () => {
      const stops = createMockStops();
      render(
        <TripTracker
          stops={stops}
          line="N"
          destination="Astor Pl"
          minutesToDestination={10}
          isExpired={false}
        />
      );

      // Find the live region - it should be visually hidden but available to screen readers
      const liveRegion = screen.getByRole("status");
      expect(liveRegion).toBeInTheDocument();
      expect(liveRegion).toHaveAttribute("aria-live", "polite");
      expect(liveRegion).toHaveAttribute("aria-atomic", "true");
    });

    it("should announce current stop status", () => {
      const stops = createMockStops();
      render(
        <TripTracker
          stops={stops}
          line="N"
          destination="Astor Pl"
          minutesToDestination={10}
          isExpired={false}
        />
      );

      const liveRegion = screen.getByRole("status");
      expect(liveRegion).toHaveTextContent(/currently at/i);
      expect(liveRegion).toHaveTextContent(/34th St - Penn Station/i);
    });

    it("should announce next stop with ETA when no current stop", () => {
      const stops = createMockStops();
      // Modify to have no current stop
      if (stops[1]) stops[1].status = "passed";
      if (stops[2]) stops[2].status = "next";

      render(
        <TripTracker
          stops={stops}
          line="N"
          destination="Astor Pl"
          minutesToDestination={7}
          isExpired={false}
        />
      );

      const liveRegion = screen.getByRole("status");
      expect(liveRegion).toHaveTextContent(/approaching/i);
      expect(liveRegion).toHaveTextContent(/23rd St/i);
      expect(liveRegion).toHaveTextContent(/3 minutes/i);
    });

    it("should announce destination arrival", () => {
      const stops = createMockStops();
      // Set all but destination as passed
      stops.forEach((stop, i) => {
        if (i < stops.length - 1) stop.status = "passed";
      });
      const lastStop = stops[stops.length - 1];
      if (lastStop) {
        lastStop.status = "destination";
        lastStop.minutesAway = 2;
      }

      render(
        <TripTracker
          stops={stops}
          line="N"
          destination="Astor Pl"
          minutesToDestination={2}
          isExpired={false}
        />
      );

      const liveRegion = screen.getByRole("status");
      expect(liveRegion).toHaveTextContent(/arriving at/i);
      expect(liveRegion).toHaveTextContent(/Astor Pl/i);
      expect(liveRegion).toHaveTextContent(/2 minutes/i);
    });
  });

  describe("Expired Trip", () => {
    it("should announce trip ended when expired", () => {
      const stops = createMockStops();
      render(
        <TripTracker
          stops={stops}
          line="N"
          destination="Astor Pl"
          minutesToDestination={null}
          isExpired={true}
        />
      );

      const liveRegion = screen.getByRole("status");
      expect(liveRegion).toHaveTextContent(/trip ended/i);
      expect(liveRegion).toHaveTextContent(/completed its run/i);
    });

    it("should show expired notice as alert region", () => {
      const stops = createMockStops();
      render(
        <TripTracker
          stops={stops}
          line="N"
          destination="Astor Pl"
          minutesToDestination={null}
          isExpired={true}
        />
      );

      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent(/trip ended/i);
    });
  });

  describe("Stop Status Indicators", () => {
    it("should have aria-labels on status dots", () => {
      const stops = createMockStops();
      const { container } = render(
        <TripTracker
          stops={stops}
          line="N"
          destination="Astor Pl"
          minutesToDestination={10}
          isExpired={false}
        />
      );

      // Check for aria-labels on status indicators
      const passedDot = container.querySelector('[aria-label="Passed"]');
      const currentDot = container.querySelector('[aria-label="Current position"]');
      const nextDot = container.querySelector('[aria-label="Next stop"]');
      const upcomingDot = container.querySelector('[aria-label="Upcoming"]');
      const destinationDot = container.querySelector('[aria-label="Destination"]');

      expect(passedDot).toBeInTheDocument();
      expect(currentDot).toBeInTheDocument();
      expect(nextDot).toBeInTheDocument();
      expect(upcomingDot).toBeInTheDocument();
      expect(destinationDot).toBeInTheDocument();
    });
  });

  describe("ETA Announcements", () => {
    it("should announce 'now' when minutesAway is 0", () => {
      const stops = createMockStops();
      if (stops[2]) {
        stops[2].status = "next";
        stops[2].minutesAway = 0;
      }

      render(
        <TripTracker
          stops={stops}
          line="N"
          destination="Astor Pl"
          minutesToDestination={0}
          isExpired={false}
        />
      );

      const liveRegion = screen.getByRole("status");
      expect(liveRegion).toHaveTextContent(/now\b/);
    });

    it("should use singular 'minute' when 1 minute away", () => {
      const stops = createMockStops();
      if (stops[1]) stops[1].status = "passed";
      if (stops[2]) {
        stops[2].status = "next";
        stops[2].minutesAway = 1;
      }

      render(
        <TripTracker
          stops={stops}
          line="N"
          destination="Astor Pl"
          minutesToDestination={1}
          isExpired={false}
        />
      );

      const liveRegion = screen.getByRole("status");
      expect(liveRegion).toHaveTextContent(/1 minute/);
    });

    it("should use plural 'minutes' when more than 1 minute away", () => {
      const stops = createMockStops();
      if (stops[1]) stops[1].status = "passed";
      if (stops[2]) {
        stops[2].status = "next";
        stops[2].minutesAway = 5;
      }

      render(
        <TripTracker
          stops={stops}
          line="N"
          destination="Astor Pl"
          minutesToDestination={5}
          isExpired={false}
        />
      );

      const liveRegion = screen.getByRole("status");
      expect(liveRegion).toHaveTextContent(/5 minutes/);
    });
  });

  describe("Remaining Stops", () => {
    it("should announce remaining stops count from current position", () => {
      const stops = createMockStops();
      render(
        <TripTracker
          stops={stops}
          line="N"
          destination="Astor Pl"
          minutesToDestination={10}
          isExpired={false}
        />
      );

      const liveRegion = screen.getByRole("status");
      expect(liveRegion).toHaveTextContent(/3 stops remaining/i);
    });

    it("should use singular 'stop' when only 1 stop remaining", () => {
      const stops = createMockStops();
      // Set up so only destination remains after current stop
      // Current stop is at index 3 (14th St - Union Square), destination is at index 4
      stops[0].status = "passed"; // Times Square
      stops[1].status = "passed"; // 34th St
      stops[2].status = "passed"; // 23rd St
      stops[3].status = "current"; // 14th St - current position
      // stops[4] is destination - only 1 stop remaining after current

      render(
        <TripTracker
          stops={stops}
          line="N"
          destination="Astor Pl"
          minutesToDestination={2}
          isExpired={false}
        />
      );

      const liveRegion = screen.getByRole("status");
      expect(liveRegion).toHaveTextContent(/1 stop remaining/i);
    });
  });
});
