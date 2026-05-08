/**
 * Unit tests for trip tracking validation schemas
 */

import { describe, expect, it } from "vitest";
import { tripCreateRequestSchema, tripNotesUpdateRequestSchema, tripQuerySchema } from "./trips.js";

describe("trips schemas", () => {
  describe("tripCreateRequestSchema", () => {
    const validRequest = {
      origin: "123",
      destination: "456",
      line: "A",
      departureTime: 1_600_000_000,
      arrivalTime: 1_600_003_600,
    };

    it("accepts valid trip create request", () => {
      const result = tripCreateRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it("accepts request with date", () => {
      const request = { ...validRequest, date: "2024-01-15" };
      const result = tripCreateRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it("accepts request with notes", () => {
      const request = { ...validRequest, notes: "Crowded train" };
      const result = tripCreateRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it("accepts timestamp in seconds", () => {
      const request = {
        ...validRequest,
        departureTime: 1_600_000_000,
        arrivalTime: 1_600_003_600,
      };
      const result = tripCreateRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it("accepts timestamp in milliseconds", () => {
      const request = {
        ...validRequest,
        departureTime: 1_600_000_000_000,
        arrivalTime: 1_600_003_600_000,
      };
      const result = tripCreateRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it("rejects arrival before departure", () => {
      const request = { ...validRequest, arrivalTime: 1_599_999_999 };
      const result = tripCreateRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.includes("after"))).toBe(true);
      }
    });

    it("rejects same origin and destination", () => {
      const request = { ...validRequest, destination: "123" };
      const result = tripCreateRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.includes("different"))).toBe(true);
      }
    });

    it("rejects invalid date format", () => {
      const request = { ...validRequest, date: "01/15/2024" };
      const result = tripCreateRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects timestamp before year 2000", () => {
      const request = { ...validRequest, departureTime: 900_000_000 };
      const result = tripCreateRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects negative timestamp", () => {
      const request = { ...validRequest, departureTime: -1 };
      const result = tripCreateRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects empty station ID", () => {
      const request = { ...validRequest, origin: "" };
      const result = tripCreateRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects station ID with invalid characters", () => {
      const request = { ...validRequest, origin: "station@123" };
      const result = tripCreateRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects station ID exceeding max length", () => {
      const request = { ...validRequest, origin: "a".repeat(51) };
      const result = tripCreateRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects empty line ID", () => {
      const request = { ...validRequest, line: "" };
      const result = tripCreateRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects lowercase line ID", () => {
      const request = { ...validRequest, line: "a" };
      const result = tripCreateRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects line ID exceeding max length", () => {
      const request = { ...validRequest, line: "ABCDEFGHIJK" };
      const result = tripCreateRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects notes with HTML tags", () => {
      const request = { ...validRequest, notes: "See <script>alert('xss')</script>" };
      const result = tripCreateRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects notes with event handlers", () => {
      const request = { ...validRequest, notes: "Click onclick=doSomething()" };
      const result = tripCreateRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects notes exceeding max length", () => {
      const request = { ...validRequest, notes: "a".repeat(5001) };
      const result = tripCreateRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });
  });

  describe("tripNotesUpdateRequestSchema", () => {
    const validRequest = {
      notes: "Updated notes",
    };

    it("accepts valid notes update", () => {
      const result = tripNotesUpdateRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it("accepts empty notes", () => {
      const request = { notes: "" };
      const result = tripNotesUpdateRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it("rejects notes with HTML tags", () => {
      const request = { notes: "See <b>bold</b> text" };
      const result = tripNotesUpdateRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects notes with event handlers", () => {
      const request = { notes: "Text with onload=bad()" };
      const result = tripNotesUpdateRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it("rejects notes exceeding max length", () => {
      const request = { notes: "a".repeat(5001) };
      const result = tripNotesUpdateRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });
  });

  describe("tripQuerySchema", () => {
    const validQuery = {};

    it("accepts empty query", () => {
      const result = tripQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });

    it("accepts query with limit", () => {
      const query = { limit: 25 };
      const result = tripQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
    });

    it("accepts query with offset", () => {
      const query = { offset: 50 };
      const result = tripQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
    });

    it("accepts query with date range", () => {
      const query = { startDate: "2024-01-01", endDate: "2024-01-31" };
      const result = tripQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
    });

    it("accepts query with station filters", () => {
      const query = { originId: "123", destinationId: "456" };
      const result = tripQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
    });

    it("accepts query with line filter", () => {
      const query = { line: "A" };
      const result = tripQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
    });

    it("accepts query with source filter", () => {
      const sources = ["manual", "tracked", "inferred"] as const;
      for (const source of sources) {
        const query = { source };
        const result = tripQuerySchema.safeParse(query);
        expect(result.success).toBe(true);
      }
    });

    it("rejects limit below minimum", () => {
      const query = { limit: 0 };
      const result = tripQuerySchema.safeParse(query);
      expect(result.success).toBe(false);
    });

    it("rejects limit above maximum", () => {
      const query = { limit: 101 };
      const result = tripQuerySchema.safeParse(query);
      expect(result.success).toBe(false);
    });

    it("rejects negative offset", () => {
      const query = { offset: -1 };
      const result = tripQuerySchema.safeParse(query);
      expect(result.success).toBe(false);
    });

    it("rejects invalid date format", () => {
      const query = { startDate: "01/01/2024" };
      const result = tripQuerySchema.safeParse(query);
      expect(result.success).toBe(false);
    });

    it("rejects invalid station ID", () => {
      const query = { originId: "station@123" };
      const result = tripQuerySchema.safeParse(query);
      expect(result.success).toBe(false);
    });

    it("rejects invalid line ID", () => {
      const query = { line: "a" };
      const result = tripQuerySchema.safeParse(query);
      expect(result.success).toBe(false);
    });

    it("rejects invalid source", () => {
      const query = { source: "invalid" };
      const result = tripQuerySchema.safeParse(query);
      expect(result.success).toBe(false);
    });
  });
});
