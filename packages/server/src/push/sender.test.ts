/**
 * Tests for Web Push sender.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendPushNotification } from "./sender.js";
import { closePushDatabase, initPushDatabase } from "./subscriptions.js";
import { configureWebPush, getVapidPublicKey } from "./vapid.js";

// Mock web-push
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

import webpush from "web-push";

describe("sendPushNotification", () => {
  beforeEach(() => {
    initPushDatabase(":memory:");
    vi.clearAllMocks();
    // Configure web-push
    configureWebPush({
      publicKey: "test-public-key",
      privateKey: "test-private-key",
    });
  });

  afterEach(() => {
    closePushDatabase();
  });

  it("returns false when web-push is not configured", async () => {
    // Reset configuration
    vi.mocked(webpush.setVapidDetails).mockClear();
    const unconfiguredGet = vi
      .spyOn(await import("./vapid.js"), "isWebPushConfigured")
      .mockReturnValue(false);

    const result = await sendPushNotification(
      {
        endpoint: "https://example.com/sub",
        p256dh: "test-p256dh",
        auth: "test-auth",
      },
      { title: "Test", body: "Test notification" }
    );

    expect(result).toBe(false);
    unconfiguredGet.mockRestore();
  });

  it("sends notification successfully and returns true", async () => {
    vi.mocked(webpush.sendNotification).mockResolvedValue(undefined);

    const result = await sendPushNotification(
      {
        endpoint: "https://example.com/sub",
        p256dh: "test-p256dh",
        auth: "test-auth",
      },
      { title: "Test", body: "Test notification", lines: ["1", "2"] }
    );

    expect(result).toBe(true);
    expect(webpush.sendNotification).toHaveBeenCalledWith(
      {
        endpoint: "https://example.com/sub",
        keys: { p256dh: "test-p256dh", auth: "test-auth" },
      },
      JSON.stringify({ title: "Test", body: "Test notification", lines: ["1", "2"] }),
      { TTL: 3600 }
    );
  });

  it("removes subscription and returns false on 410 Gone", async () => {
    const error = new Error("Gone") as Error & { statusCode: number };
    error.statusCode = 410;
    vi.mocked(webpush.sendNotification).mockRejectedValue(error);

    const result = await sendPushNotification(
      {
        endpoint: "https://example.com/sub",
        p256dh: "test-p256dh",
        auth: "test-auth",
      },
      { title: "Test", body: "Test notification" }
    );

    expect(result).toBe(false);
  });

  it("removes subscription and returns false on 404 Not Found", async () => {
    const error = new Error("Not Found") as Error & { statusCode: number };
    error.statusCode = 404;
    vi.mocked(webpush.sendNotification).mockRejectedValue(error);

    const result = await sendPushNotification(
      {
        endpoint: "https://example.com/sub",
        p256dh: "test-p256dh",
        auth: "test-auth",
      },
      { title: "Test", body: "Test notification" }
    );

    expect(result).toBe(false);
  });

  it("throws on unexpected errors", async () => {
    const error = new Error("Unexpected error");
    vi.mocked(webpush.sendNotification).mockRejectedValue(error);

    await expect(
      sendPushNotification(
        {
          endpoint: "https://example.com/sub",
          p256dh: "test-p256dh",
          auth: "test-auth",
        },
        { title: "Test", body: "Test notification" }
      )
    ).rejects.toThrow("Unexpected error");
  });

  it("handles error without statusCode gracefully", async () => {
    const error = new Error("Network error");
    vi.mocked(webpush.sendNotification).mockRejectedValue(error);

    await expect(
      sendPushNotification(
        {
          endpoint: "https://example.com/sub",
          p256dh: "test-p256dh",
          auth: "test-auth",
        },
        { title: "Test", body: "Test notification" }
      )
    ).rejects.toThrow("Network error");
  });

  it("handles null error object", async () => {
    vi.mocked(webpush.sendNotification).mockRejectedValue(null);

    await expect(
      sendPushNotification(
        {
          endpoint: "https://example.com/sub",
          p256dh: "test-p256dh",
          auth: "test-auth",
        },
        { title: "Test", body: "Test notification" }
      )
    ).rejects.toThrow();
  });
});
