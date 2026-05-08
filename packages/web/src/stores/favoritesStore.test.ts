/**
 * Tests for favorites store.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFavoritesStore } from "./favoritesStore";

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

vi.stubGlobal("localStorage", localStorageMock);

// Mock crypto.randomUUID
vi.stubGlobal("crypto", {
  randomUUID: () => "test-uuid-" + Math.random().toString(36),
});

describe("favoritesStore", () => {
  beforeEach(() => {
    // Reset store before each test
    useFavoritesStore.setState({
      favorites: [],
      commutes: [],
      tapHistory: [],
      onboardingComplete: false,
    });
    vi.clearAllMocks();
  });

  describe("addFavorite", () => {
    it("adds a favorite with generated ID and sortOrder", () => {
      const favorite = {
        stationId: "123",
        stationName: "Test Station",
        lines: ["1"],
        direction: "N" as const,
      };

      const id = useFavoritesStore.getState().addFavorite(favorite);

      expect(id).toBeDefined();
      expect(typeof id).toBe("string");

      const state = useFavoritesStore.getState();
      expect(state.favorites).toHaveLength(1);
      expect(state.favorites[0]?.id).toBe(id);
      expect(state.favorites[0]?.sortOrder).toBe(0);
      expect(state.favorites[0]?.stationName).toBe("Test Station");
    });

    it("sets default pinned to false when not provided", () => {
      const favorite = {
        stationId: "123",
        stationName: "Test Station",
        lines: ["1"],
        direction: "N" as const,
      };

      useFavoritesStore.getState().addFavorite(favorite);

      const state = useFavoritesStore.getState();
      expect(state.favorites[0]?.pinned).toBe(false);
    });

    it("respects pinned when provided", () => {
      const favorite = {
        stationId: "123",
        stationName: "Test Station",
        lines: ["1"],
        direction: "N" as const,
        pinned: true,
      };

      useFavoritesStore.getState().addFavorite(favorite);

      const state = useFavoritesStore.getState();
      expect(state.favorites[0]?.pinned).toBe(true);
    });

    it("increments sortOrder for multiple favorites", () => {
      const favorite = {
        stationId: "123",
        stationName: "Test Station",
        lines: ["1"],
        direction: "N" as const,
      };

      useFavoritesStore.getState().addFavorite(favorite);
      useFavoritesStore.getState().addFavorite(favorite);
      useFavoritesStore.getState().addFavorite(favorite);

      const state = useFavoritesStore.getState();
      expect(state.favorites).toHaveLength(3);
      expect(state.favorites[0]?.sortOrder).toBe(0);
      expect(state.favorites[1]?.sortOrder).toBe(1);
      expect(state.favorites[2]?.sortOrder).toBe(2);
    });
  });

  describe("updateFavorite", () => {
    it("updates existing favorite", () => {
      const favorite = {
        stationId: "123",
        stationName: "Test Station",
        lines: ["1"],
        direction: "N" as const,
      };

      const id = useFavoritesStore.getState().addFavorite(favorite);

      useFavoritesStore.getState().updateFavorite(id, { stationName: "Updated Name" });

      const state = useFavoritesStore.getState();
      expect(state.favorites[0]?.stationName).toBe("Updated Name");
    });

    it("does not affect other favorites", () => {
      const favorite = {
        stationId: "123",
        stationName: "Test Station",
        lines: ["1"],
        direction: "N" as const,
      };

      const id1 = useFavoritesStore.getState().addFavorite(favorite);
      useFavoritesStore.getState().addFavorite(favorite);

      useFavoritesStore.getState().updateFavorite(id1, { stationName: "Updated Name" });

      const state = useFavoritesStore.getState();
      expect(state.favorites[0]?.stationName).toBe("Updated Name");
      expect(state.favorites[1]?.stationName).toBe("Test Station");
    });
  });

  describe("removeFavorite", () => {
    it("removes favorite by ID", () => {
      const favorite = {
        stationId: "123",
        stationName: "Test Station",
        lines: ["1"],
        direction: "N" as const,
      };

      const id1 = useFavoritesStore.getState().addFavorite(favorite);
      const id2 = useFavoritesStore.getState().addFavorite(favorite);

      expect(useFavoritesStore.getState().favorites).toHaveLength(2);

      useFavoritesStore.getState().removeFavorite(id1);

      const state = useFavoritesStore.getState();
      expect(state.favorites).toHaveLength(1);
      expect(state.favorites[0]?.id).toBe(id2);
    });

    it("reorders remaining favorites", () => {
      const favorite = {
        stationId: "123",
        stationName: "Test Station",
        lines: ["1"],
        direction: "N" as const,
      };

      useFavoritesStore.getState().addFavorite(favorite);
      useFavoritesStore.getState().addFavorite(favorite);
      useFavoritesStore.getState().addFavorite(favorite);

      // Remove middle favorite
      const middleId = useFavoritesStore.getState().favorites[1]?.id;
      useFavoritesStore.getState().removeFavorite(middleId!);

      const state = useFavoritesStore.getState();
      expect(state.favorites).toHaveLength(2);
      expect(state.favorites[0]?.sortOrder).toBe(0);
      expect(state.favorites[1]?.sortOrder).toBe(1);
    });
  });

  describe("reorderFavorites", () => {
    it("reorders favorites", () => {
      const favorite = {
        stationId: "123",
        stationName: "Test Station",
        lines: ["1"],
        direction: "N" as const,
      };

      useFavoritesStore.getState().addFavorite({ ...favorite, stationName: "Station 1" });
      useFavoritesStore.getState().addFavorite({ ...favorite, stationName: "Station 2" });
      useFavoritesStore.getState().addFavorite({ ...favorite, stationName: "Station 3" });

      useFavoritesStore.getState().reorderFavorites(0, 2);

      const state = useFavoritesStore.getState();
      expect(state.favorites[0]?.stationName).toBe("Station 2");
      expect(state.favorites[1]?.stationName).toBe("Station 3");
      expect(state.favorites[2]?.stationName).toBe("Station 1");
    });

    it("updates sortOrder for all favorites", () => {
      const favorite = {
        stationId: "123",
        stationName: "Test Station",
        lines: ["1"],
        direction: "N" as const,
      };

      useFavoritesStore.getState().addFavorite(favorite);
      useFavoritesStore.getState().addFavorite(favorite);
      useFavoritesStore.getState().addFavorite(favorite);

      useFavoritesStore.getState().reorderFavorites(2, 0);

      const state = useFavoritesStore.getState();
      expect(state.favorites[0]?.sortOrder).toBe(0);
      expect(state.favorites[1]?.sortOrder).toBe(1);
      expect(state.favorites[2]?.sortOrder).toBe(2);
    });
  });

  describe("togglePin", () => {
    it("toggles pinned state", () => {
      const favorite = {
        stationId: "123",
        stationName: "Test Station",
        lines: ["1"],
        direction: "N" as const,
        pinned: false,
      };

      const id = useFavoritesStore.getState().addFavorite(favorite);

      expect(useFavoritesStore.getState().favorites[0]?.pinned).toBe(false);

      useFavoritesStore.getState().togglePin(id);

      expect(useFavoritesStore.getState().favorites[0]?.pinned).toBe(true);

      useFavoritesStore.getState().togglePin(id);

      expect(useFavoritesStore.getState().favorites[0]?.pinned).toBe(false);
    });
  });

  describe("addCommute", () => {
    it("adds a commute with generated ID", () => {
      const commute = {
        name: "Work Commute",
        origin: { stationId: "123", stationName: "Origin Station" },
        destination: { stationId: "456", stationName: "Destination Station" },
        preferredLines: [],
        enableTransferSuggestions: false,
      };

      const id = useFavoritesStore.getState().addCommute(commute);

      expect(id).toBeDefined();

      const state = useFavoritesStore.getState();
      expect(state.commutes).toHaveLength(1);
      expect(state.commutes[0]?.id).toBe(id);
      expect(state.commutes[0]?.name).toBe("Work Commute");
    });
  });

  describe("updateCommute", () => {
    it("updates existing commute", () => {
      const commute = {
        name: "Work Commute",
        origin: { stationId: "123", stationName: "Origin Station" },
        destination: { stationId: "456", stationName: "Destination Station" },
        preferredLines: [],
        enableTransferSuggestions: false,
      };

      const id = useFavoritesStore.getState().addCommute(commute);

      useFavoritesStore.getState().updateCommute(id, { name: "Updated Commute" });

      const state = useFavoritesStore.getState();
      expect(state.commutes[0]?.name).toBe("Updated Commute");
    });
  });

  describe("removeCommute", () => {
    it("removes commute by ID", () => {
      const commute = {
        name: "Work Commute",
        origin: { stationId: "123", stationName: "Origin Station" },
        destination: { stationId: "456", stationName: "Destination Station" },
        preferredLines: [],
        enableTransferSuggestions: false,
      };

      const id = useFavoritesStore.getState().addCommute(commute);

      expect(useFavoritesStore.getState().commutes).toHaveLength(1);

      useFavoritesStore.getState().removeCommute(id);

      expect(useFavoritesStore.getState().commutes).toHaveLength(0);
    });
  });

  describe("toggleCommutePin", () => {
    it("toggles isPinned state", () => {
      const commute = {
        name: "Work Commute",
        origin: { stationId: "123", stationName: "Origin Station" },
        destination: { stationId: "456", stationName: "Destination Station" },
        preferredLines: [],
        enableTransferSuggestions: false,
        isPinned: false,
      };

      const id = useFavoritesStore.getState().addCommute(commute);

      expect(useFavoritesStore.getState().commutes[0]?.isPinned).toBe(false);

      useFavoritesStore.getState().toggleCommutePin(id);

      expect(useFavoritesStore.getState().commutes[0]?.isPinned).toBe(true);
    });
  });

  describe("recordTap", () => {
    it("records tap event with timestamp data", () => {
      const favorite = {
        stationId: "123",
        stationName: "Test Station",
        lines: ["1"],
        direction: "N" as const,
      };

      const id = useFavoritesStore.getState().addFavorite(favorite);
      useFavoritesStore.getState().recordTap(id);

      const state = useFavoritesStore.getState();
      expect(state.tapHistory).toHaveLength(1);
      expect(state.tapHistory[0]?.favoriteId).toBe(id);
      expect(state.tapHistory[0]?.dayOfWeek).toBeGreaterThanOrEqual(0);
      expect(state.tapHistory[0]?.dayOfWeek).toBeLessThanOrEqual(6);
      expect(state.tapHistory[0]?.hour).toBeGreaterThanOrEqual(0);
      expect(state.tapHistory[0]?.hour).toBeLessThanOrEqual(23);
    });

    it("maintains FIFO cap at 500 entries", () => {
      const favorite = {
        stationId: "123",
        stationName: "Test Station",
        lines: ["1"],
        direction: "N" as const,
      };

      const id = useFavoritesStore.getState().addFavorite(favorite);

      // Add 501 tap events
      for (let i = 0; i < 501; i++) {
        useFavoritesStore.getState().recordTap(id);
      }

      const state = useFavoritesStore.getState();
      expect(state.tapHistory).toHaveLength(500);
    });
  });

  describe("completeOnboarding", () => {
    it("sets onboardingComplete to true", () => {
      expect(useFavoritesStore.getState().onboardingComplete).toBe(false);

      useFavoritesStore.getState().completeOnboarding();

      expect(useFavoritesStore.getState().onboardingComplete).toBe(true);
    });
  });
});
