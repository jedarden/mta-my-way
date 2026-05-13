/**
 * Unit tests for response size limits middleware utilities.
 */

import { describe, expect, it } from "vitest";
import { createPaginatedResponse, estimatePayloadSize } from "./response-size-limits.js";

describe("estimatePayloadSize", () => {
  it("returns 4 for null", () => {
    expect(estimatePayloadSize(null)).toBe(4);
  });

  it("returns 4 for undefined", () => {
    expect(estimatePayloadSize(undefined)).toBe(4);
  });

  it("returns length for strings", () => {
    expect(estimatePayloadSize("hello")).toBe(5);
    expect(estimatePayloadSize("")).toBe(0);
  });

  it("returns digit count for numbers", () => {
    expect(estimatePayloadSize(42)).toBe(2);
    expect(estimatePayloadSize(1000)).toBe(4);
    expect(estimatePayloadSize(0)).toBe(1);
  });

  it("returns 4 for true", () => {
    expect(estimatePayloadSize(true)).toBe(4);
  });

  it("returns 5 for false", () => {
    expect(estimatePayloadSize(false)).toBe(5);
  });

  it("estimates array size including brackets", () => {
    // [] = 2 brackets + sum of elements
    const result = estimatePayloadSize([]);
    expect(result).toBe(2);
  });

  it("estimates array with elements", () => {
    // [1,2] = 2 brackets + 1 + 1 = 4
    const result = estimatePayloadSize([1, 2]);
    expect(result).toBeGreaterThan(2);
  });

  it("estimates object size including braces", () => {
    const result = estimatePayloadSize({});
    expect(result).toBe(2);
  });

  it("estimates object with keys and values", () => {
    const result = estimatePayloadSize({ name: "Alice" });
    // At minimum: 2 (braces) + 4 (name) + 3 (":) + 5 (Alice) = 14+
    expect(result).toBeGreaterThan(10);
  });

  it("handles nested objects", () => {
    const result = estimatePayloadSize({ a: { b: "value" } });
    expect(result).toBeGreaterThan(estimatePayloadSize({ b: "value" }));
  });
});

describe("createPaginatedResponse", () => {
  const data = Array.from({ length: 25 }, (_, i) => ({ id: i + 1 }));

  it("returns first page correctly", () => {
    const result = createPaginatedResponse(data, 1, 10);
    expect(result.data).toHaveLength(10);
    expect(result.data[0]).toEqual({ id: 1 });
    expect(result.data[9]).toEqual({ id: 10 });
  });

  it("returns second page correctly", () => {
    const result = createPaginatedResponse(data, 2, 10);
    expect(result.data).toHaveLength(10);
    expect(result.data[0]).toEqual({ id: 11 });
  });

  it("returns last partial page correctly", () => {
    const result = createPaginatedResponse(data, 3, 10);
    expect(result.data).toHaveLength(5);
    expect(result.data[0]).toEqual({ id: 21 });
  });

  it("sets pagination metadata correctly", () => {
    const result = createPaginatedResponse(data, 1, 10);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.pageSize).toBe(10);
    expect(result.pagination.totalCount).toBe(25);
    expect(result.pagination.hasMore).toBe(true);
  });

  it("sets hasMore to false on last page", () => {
    const result = createPaginatedResponse(data, 3, 10);
    expect(result.pagination.hasMore).toBe(false);
  });

  it("handles empty data", () => {
    const result = createPaginatedResponse([], 1, 10);
    expect(result.data).toHaveLength(0);
    expect(result.pagination.totalCount).toBe(0);
    expect(result.pagination.hasMore).toBe(false);
  });

  it("handles page size larger than data", () => {
    const result = createPaginatedResponse(data, 1, 100);
    expect(result.data).toHaveLength(25);
    expect(result.pagination.hasMore).toBe(false);
  });
});
