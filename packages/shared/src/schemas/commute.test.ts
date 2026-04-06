/**
 * Unit tests for commute validation schemas
 */

import { describe, expect, it } from "vitest";
import { commuteAnalyzeRequestSchema } from "./commute.js";

describe("commute schemas", () => {
  describe("commuteAnalyzeRequestSchema", () => {
    const validRequest = {
      originId: "123",
      destinationId: "456",
      preferredLines: ["1", "2", "3"],
      commuteId: "commute-123",
      accessibleMode: false,
    };

    it("accepts valid request with all fields", () => {
      const result = commuteAnalyzeRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it("accepts valid request with minimal fields", () => {
      const minimalRequest = {
        originId: "123",
        destinationId: "456",
      };
      const result = commuteAnalyzeRequestSchema.safeParse(minimalRequest);
      expect(result.success).toBe(true);
    });

    it("rejects request without originId", () => {
      const invalidRequest = { ...validRequest, originId: "" };
      const result = commuteAnalyzeRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it("rejects request without destinationId", () => {
      const invalidRequest = { ...validRequest, destinationId: "" };
      const result = commuteAnalyzeRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it("rejects request with non-boolean accessibleMode", () => {
      const invalidRequest = { ...validRequest, accessibleMode: "true" };
      const result = commuteAnalyzeRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it("accepts empty preferredLines array", () => {
      const request = { ...validRequest, preferredLines: [] };
      const result = commuteAnalyzeRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it("rejects non-array preferredLines", () => {
      const invalidRequest = { ...validRequest, preferredLines: "1,2,3" };
      const result = commuteAnalyzeRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });
});
