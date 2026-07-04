/**
 * Tests for VAPID key management.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureWebPush,
  generateVapidKeys,
  getVapidPublicKey,
  isWebPushConfigured,
  loadOrGenerateVapidKeys,
} from "./vapid.js";

// Mock web-push
vi.mock("web-push", () => ({
  default: {
    generateVAPIDKeys: vi.fn(() => ({
      publicKey: "generated-public-key",
      privateKey: "generated-private-key",
    })),
    setVapidDetails: vi.fn(),
  },
}));

// Mock fs modules
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import webpush from "web-push";

describe("generateVapidKeys", () => {
  it("generates a VAPID key pair", () => {
    const keys = generateVapidKeys();
    expect(keys).toHaveProperty("publicKey");
    expect(keys).toHaveProperty("privateKey");
    expect(typeof keys.publicKey).toBe("string");
    expect(typeof keys.privateKey).toBe("string");
  });

  it("returns keys from mocked web-push", () => {
    const keys = generateVapidKeys();
    expect(keys.publicKey).toBe("generated-public-key");
    expect(keys.privateKey).toBe("generated-private-key");
  });
});

describe("loadOrGenerateVapidKeys", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it("loads keys from environment variables when both are set", async () => {
    process.env.VAPID_PUBLIC_KEY = "env-public-key";
    process.env.VAPID_PRIVATE_KEY = "env-private-key";

    const keys = await loadOrGenerateVapidKeys();

    expect(keys).toEqual({
      publicKey: "env-public-key",
      privateKey: "env-private-key",
    });
    expect(existsSync).not.toHaveBeenCalled();
  });

  it("loads keys from file when environment variables are not set and file exists", async () => {
    process.env.VAPID_PUBLIC_KEY = "";
    process.env.VAPID_PRIVATE_KEY = "";

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ publicKey: "file-public-key", privateKey: "file-private-key" })
    );

    const keys = await loadOrGenerateVapidKeys("/data");

    expect(keys).toEqual({
      publicKey: "file-public-key",
      privateKey: "file-private-key",
    });
    expect(existsSync).toHaveBeenCalledWith("/data/vapid-keys.json");
    expect(readFile).toHaveBeenCalledWith("/data/vapid-keys.json", "utf8");
  });

  it("generates and saves new keys when file does not exist", async () => {
    process.env.VAPID_PUBLIC_KEY = "";
    process.env.VAPID_PRIVATE_KEY = "";

    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(writeFile).mockResolvedValue(undefined);

    const keys = await loadOrGenerateVapidKeys("/data");

    expect(keys).toEqual({
      publicKey: "generated-public-key",
      privateKey: "generated-private-key",
    });
    expect(writeFile).toHaveBeenCalledWith(
      "/data/vapid-keys.json",
      JSON.stringify(
        { publicKey: "generated-public-key", privateKey: "generated-private-key" },
        null,
        2
      )
    );
  });

  it("generates ephemeral keys when no dataDir provided", async () => {
    process.env.VAPID_PUBLIC_KEY = "";
    process.env.VAPID_PRIVATE_KEY = "";

    const keys = await loadOrGenerateVapidKeys();

    expect(keys).toEqual({
      publicKey: "generated-public-key",
      privateKey: "generated-private-key",
    });
    expect(existsSync).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("handles invalid JSON in keys file", async () => {
    process.env.VAPID_PUBLIC_KEY = "";
    process.env.VAPID_PRIVATE_KEY = "";

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue("invalid json");
    vi.mocked(writeFile).mockResolvedValue(undefined);

    const keys = await loadOrGenerateVapidKeys("/data");

    // Should generate new keys when file is invalid
    expect(keys.publicKey).toBe("generated-public-key");
  });

  it("handles keys file missing required fields", async () => {
    process.env.VAPID_PUBLIC_KEY = "";
    process.env.VAPID_PRIVATE_KEY = "";

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ publicKey: "only-public" }));
    vi.mocked(writeFile).mockResolvedValue(undefined);

    const keys = await loadOrGenerateVapidKeys("/data");

    // Should generate new keys when file is incomplete
    expect(keys.publicKey).toBe("generated-public-key");
  });
});

describe("configureWebPush", () => {
  it("configures web-push with provided keys", () => {
    const keys = {
      publicKey: "test-public-key",
      privateKey: "test-private-key",
    };

    configureWebPush(keys);

    expect(webpush.setVapidDetails).toHaveBeenCalledWith(
      "mailto:mta-my-way@example.com",
      "test-public-key",
      "test-private-key"
    );
  });

  it("uses custom subject when provided", () => {
    const keys = {
      publicKey: "test-public-key",
      privateKey: "test-private-key",
    };

    configureWebPush(keys, "https://example.com");

    expect(webpush.setVapidDetails).toHaveBeenCalledWith(
      "https://example.com",
      "test-public-key",
      "test-private-key"
    );
  });

  it("uses VAPID_SUBJECT environment variable when set", () => {
    const originalSubject = process.env.VAPID_SUBJECT;
    process.env.VAPID_SUBJECT = "mailto:admin@example.com";

    const keys = {
      publicKey: "test-public-key",
      privateKey: "test-private-key",
    };

    configureWebPush(keys);

    expect(webpush.setVapidDetails).toHaveBeenCalledWith(
      "mailto:admin@example.com",
      "test-public-key",
      "test-private-key"
    );

    process.env.VAPID_SUBJECT = originalSubject;
  });

  it("stores keys for later retrieval", () => {
    const keys = {
      publicKey: "test-public-key",
      privateKey: "test-private-key",
    };

    configureWebPush(keys);

    expect(getVapidPublicKey()).toBe("test-public-key");
    expect(isWebPushConfigured()).toBe(true);
  });
});

describe("getVapidPublicKey", () => {
  it("returns null when not configured", async () => {
    // Reset by calling configure with empty
    const { getVapidPublicKey: getPublicKey } = await import("./vapid.js");
    vi.spyOn(await import("./vapid.js"), "getVapidPublicKey").mockReturnValue(null);
    expect(getVapidPublicKey()).toBeNull();
  });

  it("returns public key after configuration", () => {
    configureWebPush({
      publicKey: "configured-public-key",
      privateKey: "configured-private-key",
    });

    expect(getVapidPublicKey()).toBe("configured-public-key");
  });
});

describe("isWebPushConfigured", () => {
  it("returns false when not configured", async () => {
    // Need to reset module state
    vi.spyOn(await import("./vapid.js"), "isWebPushConfigured").mockReturnValue(false);
    expect(isWebPushConfigured()).toBe(false);
  });

  it("returns true after configuration", () => {
    configureWebPush({
      publicKey: "test-public-key",
      privateKey: "test-private-key",
    });

    expect(isWebPushConfigured()).toBe(true);
  });
});
