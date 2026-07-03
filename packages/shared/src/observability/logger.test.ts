import { type MockInstance, beforeEach, describe, expect, it, vi } from "vitest";
import { type LogEntry, type LogLevel, createLogger } from "./logger.js";

describe("observability/logger", () => {
  let consoleSpy: MockInstance;
  let entries: LogEntry[];
  let lastFormatted: string;

  const captureSink = (entry: LogEntry, formatted: string) => {
    entries.push(entry);
    lastFormatted = formatted;
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    entries = [];
    lastFormatted = "";
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  // =========================================================================
  // Log level support
  // =========================================================================
  describe("log levels", () => {
    it("supports debug, info, warn, and error levels", () => {
      const logger = createLogger({ env: "development", sink: captureSink });

      logger.debug("debug msg");
      logger.info("info msg");
      logger.warn("warn msg");
      logger.error("error msg");

      expect(entries).toHaveLength(4);
      expect(entries[0]!.level).toBe("debug");
      expect(entries[1]!.level).toBe("info");
      expect(entries[2]!.level).toBe("warn");
      expect(entries[3]!.level).toBe("error");
    });

    it("suppresses debug when minLevel is info", () => {
      const logger = createLogger({ env: "development", minLevel: "info", sink: captureSink });

      logger.debug("should be suppressed");
      logger.info("should appear");

      expect(entries).toHaveLength(1);
      expect(entries[0]!.level).toBe("info");
    });

    it("suppresses info and debug when minLevel is warn", () => {
      const logger = createLogger({ env: "development", minLevel: "warn", sink: captureSink });

      logger.debug("suppressed");
      logger.info("suppressed");
      logger.warn("shown");
      logger.error("shown");

      expect(entries).toHaveLength(2);
    });

    it("suppresses everything except error when minLevel is error", () => {
      const logger = createLogger({ env: "development", minLevel: "error", sink: captureSink });

      logger.debug("suppressed");
      logger.info("suppressed");
      logger.warn("suppressed");
      logger.error("shown");

      expect(entries).toHaveLength(1);
      expect(entries[0]!.level).toBe("error");
    });
  });

  // =========================================================================
  // Structured JSON output
  // =========================================================================
  describe("structured JSON in production", () => {
    it("emits valid JSON in production mode", () => {
      const logger = createLogger({ env: "production", sink: captureSink });

      logger.info("train approaching", { line: "A", minutesAway: 3 });

      expect(lastFormatted).toBeDefined();
      const parsed = JSON.parse(lastFormatted);
      expect(parsed).toEqual(
        expect.objectContaining({
          timestamp: expect.any(String),
          level: "info",
          message: "train approaching",
          context: { line: "A", minutesAway: 3 },
        })
      );
    });

    it("includes service and component in JSON output", () => {
      const logger = createLogger({
        env: "production",
        service: "api",
        component: "feeds",
        sink: captureSink,
      });

      logger.info("feed refreshed");

      const parsed = JSON.parse(lastFormatted);
      expect(parsed.service).toBe("api");
      expect(parsed.component).toBe("feeds");
    });

    it("includes error details in JSON output", () => {
      const err = new Error("timeout");
      const logger = createLogger({ env: "production", sink: captureSink });

      logger.error("request failed", err);

      const parsed = JSON.parse(lastFormatted);
      expect(parsed.error).toEqual({
        name: "Error",
        message: "timeout",
        stack: expect.any(String),
      });
    });
  });

  // =========================================================================
  // Required fields
  // =========================================================================
  describe("entry fields", () => {
    it("always includes timestamp, level, and message", () => {
      const logger = createLogger({ env: "production", sink: captureSink });

      logger.info("hello");

      const parsed = JSON.parse(lastFormatted);
      expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(parsed.level).toBe("info");
      expect(parsed.message).toBe("hello");
    });

    it("includes context when provided", () => {
      const logger = createLogger({ env: "production", sink: captureSink });

      logger.info("data loaded", { rows: 100, source: "cache" });

      const parsed = JSON.parse(lastFormatted);
      expect(parsed.context).toEqual({ rows: 100, source: "cache" });
    });

    it("omits context field when no context is provided", () => {
      const logger = createLogger({ env: "production", sink: captureSink });

      logger.info("no context");

      const parsed = JSON.parse(lastFormatted);
      expect(parsed).not.toHaveProperty("context");
    });

    it("merges base config context with per-call context", () => {
      const logger = createLogger({
        env: "production",
        context: { region: "us-east" },
        sink: captureSink,
      });

      logger.info("request", { path: "/arrivals" });

      const parsed = JSON.parse(lastFormatted);
      expect(parsed.context).toEqual({ region: "us-east", path: "/arrivals" });
    });
  });

  // =========================================================================
  // Environment detection
  // =========================================================================
  describe("environment detection", () => {
    it("defaults to pretty-printed output in development", () => {
      const logger = createLogger({ env: "development", sink: captureSink });

      logger.info("dev message");

      // Pretty format is not valid JSON (has newlines, brackets)
      expect(() => JSON.parse(lastFormatted)).toThrow();
      expect(lastFormatted).toContain("INFO");
      expect(lastFormatted).toContain("dev message");
    });

    it("emits JSON when NODE_ENV=production", () => {
      const origNodeEnv = process.env["NODE_ENV"];
      process.env["NODE_ENV"] = "production";

      try {
        const logger = createLogger({ sink: captureSink });
        logger.info("prod message");

        const parsed = JSON.parse(lastFormatted);
        expect(parsed.level).toBe("info");
        expect(parsed.message).toBe("prod message");
      } finally {
        process.env["NODE_ENV"] = origNodeEnv;
      }
    });

    it("uses debug minLevel in development by default", () => {
      const logger = createLogger({ env: "development", sink: captureSink });

      logger.debug("should appear");

      expect(entries).toHaveLength(1);
    });

    it("uses info minLevel in production by default", () => {
      const logger = createLogger({ env: "production", sink: captureSink });

      logger.debug("suppressed");
      logger.info("shown");

      expect(entries).toHaveLength(1);
      expect(entries[0]!.level).toBe("info");
    });

    it("explicit env override takes precedence over NODE_ENV", () => {
      const origNodeEnv = process.env["NODE_ENV"];
      process.env["NODE_ENV"] = "production";

      try {
        // Force development format even when NODE_ENV is production
        const logger = createLogger({ env: "development", sink: captureSink });
        logger.debug("shown via override");

        // Should be pretty-printed (not JSON)
        expect(() => JSON.parse(lastFormatted)).toThrow();
        expect(entries).toHaveLength(1);
      } finally {
        process.env["NODE_ENV"] = origNodeEnv;
      }
    });
  });

  // =========================================================================
  // Console output
  // =========================================================================
  describe("console output", () => {
    it("uses console.log for debug and info", () => {
      const logger = createLogger({ env: "development" });

      logger.debug("debug to stdout");
      logger.info("info to stdout");

      expect(consoleSpy).toHaveBeenCalledTimes(2);
    });

    it("uses console.error for warn and error", () => {
      const consoleErrorSpy = vi.spyOn(console, "error");

      const logger = createLogger({ env: "development" });

      logger.warn("warn to stderr");
      logger.error("error to stderr");

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // Child logger
  // =========================================================================
  describe("child logger", () => {
    it("inherits parent config and merges additional context", () => {
      const parent = createLogger({
        env: "production",
        service: "api",
        context: { version: "1.0.0" },
        sink: captureSink,
      });

      const child = parent.child({ requestId: "abc-123" });
      child.info("child message");

      const parsed = JSON.parse(lastFormatted);
      expect(parsed.service).toBe("api");
      expect(parsed.context).toEqual({ version: "1.0.0", requestId: "abc-123" });
    });

    it("child context does not affect parent", () => {
      const parent = createLogger({
        env: "production",
        context: { base: true },
        sink: captureSink,
      });

      const child = parent.child({ extra: true });

      // Log from parent should NOT have child context
      parent.info("parent msg");
      let parsed = JSON.parse(lastFormatted);
      expect(parsed.context).toEqual({ base: true });

      // Log from child should have merged context
      child.info("child msg");
      parsed = JSON.parse(lastFormatted);
      expect(parsed.context).toEqual({ base: true, extra: true });
    });

    it("nested children accumulate context", () => {
      const root = createLogger({ env: "production", service: "worker", sink: captureSink });
      const child1 = root.child({ region: "iad" });
      const child2 = child1.child({ job: "sync" });

      child2.info("deep message");

      const parsed = JSON.parse(lastFormatted);
      expect(parsed.service).toBe("worker");
      expect(parsed.context).toEqual({ region: "iad", job: "sync" });
    });
  });

  // =========================================================================
  // Default logger instance
  // =========================================================================
  describe("default log instance", () => {
    it("can be imported and used immediately", async () => {
      const { log } = await import("./logger.js");

      expect(typeof log.debug).toBe("function");
      expect(typeof log.info).toBe("function");
      expect(typeof log.warn).toBe("function");
      expect(typeof log.error).toBe("function");
      expect(typeof log.child).toBe("function");
    });
  });
});
