/**
 * Unit tests for delay prediction validation schemas
 */

import { describe, expect, it } from "vitest";
import {
  delayPatternsQuerySchema,
  delayPredictionRequestSchema,
  delayProbabilityQuerySchema,
} from "./predictions.js";

describe("predictions schemas", () => {
  describe("delayPredictionRequestSchema", () => {
    const validRequest = {
      routeId: "1",
      direction: "N" as const,
      fromStationId: "123",
      toStationId: "456",
      scheduledMinutes: 30,
    };

    it("accepts valid prediction request", () => {
      const result = delayPredictionRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it("accepts single digit line ID", () => {
      const request = { ...validRequest, routeId: "7" };
      const result = delayPredictionRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it("accepts letter line IDs", () => {
      const letterLines = ["A", "C", "E", "G", "J", "L", "M", "N", "Q", "R", "W", "Z"];
      for (const line of letterLines) {
        const request = { ...validRequest, routeId: line };
        const result = delayPredictionRequestSchema.safeParse(request);
        expect(result.success).toBe(true);
      }
    });

    it("accepts multi-character line IDs", () => {
      const multiCharLines = ["123", "456", "A1", "B2"];
      for (const line of multiCharLines) {
        const request = { ...validRequest, routeId: line };
        const result = delayPredictionRequestSchema.safeParse(request);
        expect(result.success).toBe(true);
      }
    });

    it("accepts both directions", () => {
      const northRequest = { ...validRequest, direction: "N" as const };
      const southRequest = { ...validRequest, direction: "S" as const };
      expect(delayPredictionRequestSchema.safeParse(northRequest).success).toBe(true);
      expect(delayPredictionRequestSchema.safeParse(southRequest).success).toBe(true);
    });

    it("rejects invalid line ID (lowercase)", () => {
      const request = { ...validRequest, routeId: "a" };
      const result = delayPredictionRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects invalid line ID (special characters)", () => {
      const request = { ...validRequest, routeId: "A@#" };
      const result = delayPredictionRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects invalid direction", () => {
      const request = { ...validRequest, direction: "E" };
      const result = delayPredictionRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects same origin and destination stations", () => {
      const request = { ...validRequest, toStationId: "123" };
      const result = delayPredictionRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("different");
      }
    });

    it("rejects empty station ID", () => {
      const request = { ...validRequest, fromStationId: "" };
      const result = delayPredictionRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects station ID with invalid characters", () => {
      const request = { ...validRequest, fromStationId: "station@123" };
      const result = delayPredictionRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects station ID exceeding max length", () => {
      const request = { ...validRequest, fromStationId: "a".repeat(51) };
      const result = delayPredictionRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects scheduled minutes below minimum", () => {
      const request = { ...validRequest, scheduledMinutes: 0 };
      const result = delayPredictionRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects scheduled minutes above maximum", () => {
      const request = { ...validRequest, scheduledMinutes: 181 };
      const result = delayPredictionRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects non-integer scheduled minutes", () => {
      const request = { ...validRequest, scheduledMinutes: 30.5 };
      const result = delayPredictionRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });
  });

  describe("delayProbabilityQuerySchema", () => {
    const validQuery = {
      routeId: "A",
    };

    it("accepts valid probability query", () => {
      const result = delayProbabilityQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });

    it("accepts query with direction", () => {
      const query = { ...validQuery, direction: "N" as const };
      const result = delayProbabilityQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
    });

    it("accepts query without direction", () => {
      const result = delayProbabilityQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });

    it("rejects invalid routeId", () => {
      const query = { ...validQuery, routeId: "invalid" };
      const result = delayProbabilityQuerySchema.safeParse(query);
      expect(result.success).toBe(false);
    });

    it("rejects invalid direction", () => {
      const query = { ...validQuery, direction: "X" };
      const result = delayProbabilityQuerySchema.safeParse(query);
      expect(result.success).toBe(false);
    });
  });

  describe("delayPatternsQuerySchema", () => {
    const validQuery = {};

    it("accepts empty query", () => {
      const result = delayPatternsQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });

    it("accepts query with direction", () => {
      const query = { direction: "N" as const };
      const result = delayPatternsQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
    });

    it("rejects invalid direction", () => {
      const query = { direction: "X" };
      const result = delayPatternsQuerySchema.safeParse(query);
      expect(result.success).toBe(false);
    });
  });
});
