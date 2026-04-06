/**
 * Tests for retry utility
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRetryFetch, retry, retryWithBackoff } from "./retry.js";

describe("retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return data on first successful attempt", async () => {
    const operation = vi.fn().mockResolvedValue("success");

    const result = await retry(operation, { maxAttempts: 3 });

    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("should retry on failure and eventually succeed", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("success");

    const result = await retry(operation, { maxAttempts: 5, initialDelayMs: 10 });

    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("should throw after max attempts exhausted", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("fail"));

    await expect(retry(operation, { maxAttempts: 3, initialDelayMs: 10 })).rejects.toThrow("fail");

    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("should use exponential backoff", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("success");

    const startTime = Date.now();

    const result = await retry(operation, {
      maxAttempts: 5,
      initialDelayMs: 50,
      backoffMultiplier: 2,
      jitter: false,
    });

    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(3);

    // Should take at least 50 + 100 = 150ms for delays
    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeGreaterThanOrEqual(150);
  });

  it("should cap delay at maxDelayMs", async () => {
    const delays: number[] = [];
    const onRetry = vi.fn((_attempt, _error, delayMs) => {
      delays.push(delayMs);
    });

    const operation = vi
      .fn()
      .mockRejectedValue(new Error("fail"))
      .mockRejectedValue(new Error("fail"))
      .mockRejectedValue(new Error("fail"));

    await expect(
      retry(operation, {
        maxAttempts: 4,
        initialDelayMs: 50,
        backoffMultiplier: 10,
        maxDelayMs: 100,
        jitter: false,
        onRetry,
      })
    ).rejects.toThrow("fail");

    // Delays should be capped at 100ms
    expect(delays[0]).toBe(50); // 50 * 10^0 = 50
    expect(delays[1]).toBe(100); // 50 * 10^1 = 500, capped at 100
    expect(delays[2]).toBe(100); // 50 * 10^2 = 5000, capped at 100
  });

  it("should call onRetry callback before each retry", async () => {
    const onRetry = vi.fn();

    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail1"))
      .mockRejectedValueOnce(new Error("fail2"))
      .mockResolvedValue("success");

    await retry(operation, {
      maxAttempts: 5,
      initialDelayMs: 10,
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error), expect.any(Number));
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Error), expect.any(Number));
  });

  it("should not retry non-retryable errors", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("non-retryable"));

    await expect(
      retry(operation, {
        maxAttempts: 5,
        isRetryable: () => false,
      })
    ).rejects.toThrow("non-retryable");

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("should respect custom isRetryable predicate", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("retryable"))
      .mockRejectedValueOnce(new Error("non-retryable"))
      .mockResolvedValue("success");

    const isRetryable = (error: unknown) => error instanceof Error && error.message === "retryable";

    await expect(
      retry(operation, {
        maxAttempts: 5,
        isRetryable,
        initialDelayMs: 10,
      })
    ).rejects.toThrow("non-retryable");

    // First attempt fails, second is retryable, third fails and is not retryable
    expect(operation).toHaveBeenCalledTimes(2);
  });
});

describe("retryWithBackoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return success result on first attempt", async () => {
    const operation = vi.fn().mockResolvedValue("success");

    const result = await retryWithBackoff(operation);

    expect(result.success).toBe(true);
    expect(result.data).toBe("success");
    expect(result.attempts).toBe(1);
  });

  it("should return success result after retries", async () => {
    const operation = vi.fn().mockRejectedValueOnce(new Error("fail")).mockResolvedValue("success");

    const result = await retryWithBackoff(operation, {
      maxAttempts: 3,
      initialDelayMs: 10,
    });

    expect(result.success).toBe(true);
    expect(result.data).toBe("success");
    expect(result.attempts).toBe(2);
  });

  it("should return failure result after exhausting retries", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("fail"));

    const result = await retryWithBackoff(operation, {
      maxAttempts: 3,
      initialDelayMs: 10,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.attempts).toBe(3);
  });
});

describe("createRetryFetch", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("should create fetch function with default retry options", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValue(new Response(JSON.stringify({ data: "success" }), { status: 200 }));

    global.fetch = fetchMock;

    const fetchWithRetry = createRetryFetch({
      maxAttempts: 3,
      initialDelayMs: 10,
    });

    const response = await fetchWithRetry("https://api.example.com/data");

    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
