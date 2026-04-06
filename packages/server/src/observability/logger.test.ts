/**
 * Unit tests for logger.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogLevel, createLogger, logger } from "./logger.js";

describe("logger", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it("logs info messages", () => {
    logger.info("Test message");

    expect(consoleLogSpy).toHaveBeenCalled();
    const logArg = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
    expect(logArg.level).toBe("info");
    expect(logArg.message).toBe("Test message");
    expect(logArg.timestamp).toBeTruthy();
  });

  it("logs debug messages", () => {
    const debugLogger = createLogger({ level: LogLevel.DEBUG });
    debugLogger.debug("Debug message");

    expect(consoleLogSpy).toHaveBeenCalled();
    const logArg = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
    expect(logArg.level).toBe("debug");
  });

  it("logs warn messages", () => {
    logger.warn("Warning message");

    expect(consoleWarnSpy).toHaveBeenCalled();
    const logArg = JSON.parse(consoleWarnSpy.mock.calls[0][0] as string);
    expect(logArg.level).toBe("warn");
  });

  it("logs error messages with error details", () => {
    const error = new Error("Test error");
    logger.error("Error occurred", error);

    expect(consoleErrorSpy).toHaveBeenCalled();
    const logArg = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);
    expect(logArg.level).toBe("error");
    expect(logArg.message).toBe("Error occurred");
    expect(logArg.error).toBeTruthy();
    expect(logArg.error?.message).toBe("Test error");
  });

  it("includes context in logs", () => {
    logger.info("Test with context", { userId: "123", action: "login" });

    expect(consoleLogSpy).toHaveBeenCalled();
    const logArg = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
    expect(logArg.context).toEqual({ userId: "123", action: "login" });
  });

  it("respects log level configuration", () => {
    const errorLogger = createLogger({ level: LogLevel.ERROR });

    errorLogger.info("This should not log");
    errorLogger.debug("This should not log");
    errorLogger.warn("This should not log");
    errorLogger.error("This should log");

    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("creates child logger with additional context", () => {
    const childLogger = logger.child({ service: "test-service" });

    childLogger.info("Child message");

    expect(consoleLogSpy).toHaveBeenCalled();
    const logArg = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
    expect(logArg.context?.service).toBe("test-service");
  });

  it("child logger preserves parent context and adds new context", () => {
    const childLogger = logger.child({ service: "api" });
    childLogger.info("Message", { userId: "123" });

    const logArg = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
    expect(logArg.context?.service).toBe("api");
    expect(logArg.context?.userId).toBe("123");
  });
});
