import { beforeEach, describe, expect, it } from "vitest";
import { getResourceType, registerResourceType } from "../middleware/enhanced-authorization.js";
import {
  flagSuspectedCompromise,
  getTokenTrackingStats,
  recordTokenUsage,
} from "../middleware/enhanced-jwt-security.js";
import { getRateLimiterTestMode, setRateLimiterTestMode } from "../middleware/rate-limiter.js";
import { getDeviceTrustLevel, setDeviceTrustLevel } from "../middleware/session-security.js";
import {
  type StructuredAuditEvent,
  getAuditLogStats,
  logAuditEvent,
} from "../middleware/structured-audit-log.js";
import { metrics } from "../observability/metrics.js";
import { cleanupAllState } from "./test-helpers.js";

describe("cleanupAllState", () => {
  beforeEach(async () => {
    await cleanupAllState();
  });

  it("resets integration-used singleton state and restores the default rate-limit mode", async () => {
    setRateLimiterTestMode(true);
    registerResourceType({
      type: "cleanup_test_resource",
      namespace: "cleanup-test",
      supportsOwnership: false,
      defaultPermissions: {},
    });
    recordTokenUsage("cleanup-test-token", {
      usedAt: Date.now(),
      clientIp: "127.0.0.1",
    });
    flagSuspectedCompromise("cleanup-test-token");
    setDeviceTrustLevel("cleanup-test-device", "trusted");
    metrics.counter("cleanup_test_counter", "Cleanup test counter").inc();

    const event: StructuredAuditEvent = {
      metadata: { eventId: "cleanup-test-event" },
      timestamp: new Date().toISOString(),
      category: "authentication",
      severity: "info",
      outcome: "success",
      action: "cleanup_test",
      actor: { ipAddress: "127.0.0.1" },
      details: {},
    };
    logAuditEvent(event);

    await cleanupAllState();

    expect(getRateLimiterTestMode()).toBe(false);
    expect(getResourceType("cleanup_test_resource")).toBeUndefined();
    expect(getTokenTrackingStats()).toEqual({
      totalTrackedTokens: 0,
      totalUsageRecords: 0,
      revokedTokens: 0,
      suspectedCompromises: 0,
    });
    expect(getDeviceTrustLevel("cleanup-test-device")).toBe("unknown");
    expect(getAuditLogStats().totalEvents).toBe(0);
    expect([...metrics.getAll().values()].every((series) => series.size === 0)).toBe(true);
  });
});
