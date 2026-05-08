/**
 * Unit tests for context-aware switching validation schemas
 */

import { describe, expect, it } from "vitest";
import {
  contextClearRequestSchema,
  contextDetectRequestSchema,
  contextOverrideRequestSchema,
  contextSettingsUpdateRequestSchema,
  validContexts,
} from "./context.js";

describe("context schemas", () => {
  describe("contextDetectRequestSchema", () => {
    const validRequest = {};

    it("accepts empty request", () => {
      const result = contextDetectRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it("accepts request with coordinates", () => {
      const request = { latitude: 40.7589, longitude: -73.9851 };
      const result = contextDetectRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it("accepts NYC area coordinates", () => {
      const nycCoords = [
        { lat: 40.7589, lng: -73.9851 }, // Times Square
        { lat: 40.6892, lng: -74.0445 }, // Statue Island
        { lat: 40.7484, lng: -73.9857 }, // Empire State Building
        { lat: 40.7614, lng: -73.9776 }, // Lincoln Center
      ];
      for (const { lat, lng } of nycCoords) {
        const request = { latitude: lat, longitude: lng };
        const result = contextDetectRequestSchema.safeParse(request);
        expect(result.success).toBe(true);
      }
    });

    it("rejects latitude outside NYC bounds (too far north)", () => {
      const request = { latitude: 41.5, longitude: -73.9851 };
      const result = contextDetectRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects latitude outside NYC bounds (too far south)", () => {
      const request = { latitude: 40.0, longitude: -73.9851 };
      const result = contextDetectRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects longitude outside NYC bounds (too far east)", () => {
      const request = { latitude: 40.7589, longitude: -73.5 };
      const result = contextDetectRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects longitude outside NYC bounds (too far west)", () => {
      const request = { latitude: 40.7589, longitude: -74.5 };
      const result = contextDetectRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects invalid latitude range", () => {
      const request = { latitude: 91, longitude: -73.9851 };
      const result = contextDetectRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects invalid longitude range", () => {
      const request = { latitude: 40.7589, longitude: -181 };
      const result = contextDetectRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("accepts request with tap history", () => {
      const request = {
        tapHistory: [
          { screen: "home", action: "tap_station", timestamp: 1_600_000_000 },
          { screen: "arrivals", action: "swipe_refresh", timestamp: 1_600_000_010 },
        ],
      };
      const result = contextDetectRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it("accepts request with current screen", () => {
      const request = { currentScreen: "arrivals" };
      const result = contextDetectRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it("accepts request with screen time", () => {
      const request = { screenTime: 300 };
      const result = contextDetectRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it("accepts request with recent actions", () => {
      const request = { recentActions: ["tap_station", "swipe_refresh", "view_alert"] };
      const result = contextDetectRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it("rejects tap history exceeding 100 entries", () => {
      const request = {
        tapHistory: Array.from({ length: 101 }, (_, i) => ({
          screen: "home",
          action: "tap",
          timestamp: 1_600_000_000 + i,
        })),
      };
      const result = contextDetectRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects invalid screen name", () => {
      const request = { currentScreen: "home@page" };
      const result = contextDetectRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects invalid action name", () => {
      const request = { recentActions: ["tap@station"] };
      const result = contextDetectRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects screen time exceeding maximum", () => {
      const request = { screenTime: 86401 };
      const result = contextDetectRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects negative screen time", () => {
      const request = { screenTime: -1 };
      const result = contextDetectRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects recent actions exceeding 50 entries", () => {
      const request = { recentActions: Array.from({ length: 51 }, (_, i) => `action${i}`) };
      const result = contextDetectRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects tap history with invalid screen name", () => {
      const request = {
        tapHistory: [{ screen: "home@page", action: "tap", timestamp: 1_600_000_000 }],
      };
      const result = contextDetectRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects tap history with negative timestamp", () => {
      const request = {
        tapHistory: [{ screen: "home", action: "tap", timestamp: -1 }],
      };
      const result = contextDetectRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });
  });

  describe("contextOverrideRequestSchema", () => {
    it("accepts all valid contexts", () => {
      for (const context of validContexts) {
        const request = { context };
        const result = contextOverrideRequestSchema.safeParse(request);
        expect(result.success).toBe(true);
      }
    });

    it("rejects invalid context", () => {
      const request = { context: "invalid_context" };
      const result = contextOverrideRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });
  });

  describe("contextSettingsUpdateRequestSchema", () => {
    const validRequest = {
      enabled: true,
      showIndicator: false,
      useLocation: true,
      useTimePatterns: true,
      learnPatterns: false,
    };

    it("accepts all settings fields", () => {
      const result = contextSettingsUpdateRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it("accepts partial settings update", () => {
      const partialUpdates = [
        { enabled: true },
        { showIndicator: false },
        { useLocation: true },
        { useTimePatterns: true },
        { learnPatterns: false },
      ];
      for (const update of partialUpdates) {
        const result = contextSettingsUpdateRequestSchema.safeParse(update);
        expect(result.success).toBe(true);
      }
    });

    it("accepts empty update", () => {
      const result = contextSettingsUpdateRequestSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("rejects non-boolean enabled value", () => {
      const request = { enabled: "true" };
      const result = contextSettingsUpdateRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("strips unknown fields (non-strict schema)", () => {
      const request = { invalidField: true };
      const result = contextSettingsUpdateRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
      // Extra fields should be stripped from the output
      if (result.success) {
        expect(result.data).not.toHaveProperty("invalidField");
      }
    });
  });

  describe("contextClearRequestSchema", () => {
    it("accepts empty object", () => {
      const result = contextClearRequestSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("rejects additional properties", () => {
      const request = { extra: "field" };
      const result = contextClearRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });
  });
});
