/**
 * Unit tests for authorization security module.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { AuthContext } from "./authentication.js";
import {
  type LocationAccessRule,
  type TimeBasedAccessRule,
  analyzeAccessBehavior,
  checkLocationAccess,
  checkSessionSecurity,
  checkTimeBasedAccess,
  clearAccessPatterns,
  getAccessPatternStats,
  updateAccessPattern,
} from "./authorization-security.js";

// Minimal auth context for tests
function makeAuth(keyId = "test-key"): AuthContext {
  return {
    keyId,
    scope: "read",
    role: "user",
    roles: ["user"],
    additionalPermissions: [],
    sessionId: "session-123",
    rateLimitTier: 1,
    authMethod: "api_key",
  } as AuthContext;
}

describe("checkTimeBasedAccess", () => {
  it("allows access when no restrictions are configured", () => {
    const rules: TimeBasedAccessRule = {};
    expect(checkTimeBasedAccess(rules)).toBe(true);
  });

  it("allows access when current day is in allowedDays", () => {
    const now = new Date();
    const today = now.getDay();
    const rules: TimeBasedAccessRule = { allowedDays: [today] };
    expect(checkTimeBasedAccess(rules)).toBe(true);
  });

  it("denies access when current day is not in allowedDays", () => {
    // Use a day that is never today (subtract and wrap)
    const now = new Date();
    const notToday = (now.getDay() + 3) % 7;
    const rules: TimeBasedAccessRule = { allowedDays: [notToday] };
    expect(checkTimeBasedAccess(rules)).toBe(false);
  });

  it("allows access within allowed hours", () => {
    const rules: TimeBasedAccessRule = { allowedHours: { start: 0, end: 23 } };
    expect(checkTimeBasedAccess(rules)).toBe(true);
  });

  it("denies access outside allowed hours", () => {
    // Use a range that excludes all hours (impossible range)
    const now = new Date();
    const currentHour = now.getHours();
    // Pick a 1-hour window that is NOT the current hour
    const start = (currentHour + 2) % 24;
    const end = (currentHour + 3) % 24;
    if (start < end) {
      const rules: TimeBasedAccessRule = { allowedHours: { start, end } };
      expect(checkTimeBasedAccess(rules)).toBe(false);
    }
    // If wrapping, skip the test rather than produce a false negative
  });

  it("respects date exceptions — allowing access on blocked day", () => {
    const now = new Date();
    const notToday = (now.getDay() + 3) % 7;
    const todayStr = now.toISOString().split("T")[0];

    const rules: TimeBasedAccessRule = {
      allowedDays: [notToday], // would normally block today
      exceptions: [{ date: todayStr, allowed: true }],
    };
    expect(checkTimeBasedAccess(rules)).toBe(true);
  });

  it("respects date exceptions — denying access on allowed day", () => {
    const now = new Date();
    const today = now.getDay();
    const todayStr = now.toISOString().split("T")[0];

    const rules: TimeBasedAccessRule = {
      allowedDays: [today], // would normally allow today
      exceptions: [{ date: todayStr, allowed: false }],
    };
    expect(checkTimeBasedAccess(rules)).toBe(false);
  });
});

describe("checkLocationAccess", () => {
  it("allows access for private IPs when requirePrivateConnection is false", () => {
    const rules: LocationAccessRule = { requirePrivateConnection: false };
    expect(checkLocationAccess("203.0.113.1", rules)).toBe(true);
  });

  it("denies access for non-private IPs when requirePrivateConnection is true", () => {
    const rules: LocationAccessRule = { requirePrivateConnection: true };
    expect(checkLocationAccess("203.0.113.1", rules)).toBe(false);
  });

  it("allows access for private 10.x.x.x IPs when requirePrivateConnection is true", () => {
    const rules: LocationAccessRule = { requirePrivateConnection: true };
    expect(checkLocationAccess("10.0.0.1", rules)).toBe(true);
  });

  it("allows access for private 192.168.x.x IPs when requirePrivateConnection is true", () => {
    const rules: LocationAccessRule = { requirePrivateConnection: true };
    expect(checkLocationAccess("192.168.1.100", rules)).toBe(true);
  });

  it("allows access for private 172.16.x.x IPs when requirePrivateConnection is true", () => {
    const rules: LocationAccessRule = { requirePrivateConnection: true };
    expect(checkLocationAccess("172.16.0.1", rules)).toBe(true);
  });

  it("allows IP in trusted range", () => {
    const rules: LocationAccessRule = {
      trustedIpRanges: [{ ip: "192.168.1.0", prefixLength: 24 }],
    };
    expect(checkLocationAccess("192.168.1.50", rules)).toBe(true);
  });

  it("does not block when no country rules are set and GeoIP returns null", () => {
    // extractCountryFromIp always returns null in this implementation,
    // so country-based rules are a no-op unless country data is available.
    const rules: LocationAccessRule = { blockedCountries: ["CN"] };
    expect(checkLocationAccess("203.0.113.1", rules)).toBe(true);
  });

  it("allows access when no rules are set", () => {
    const rules: LocationAccessRule = {};
    expect(checkLocationAccess("1.2.3.4", rules)).toBe(true);
  });
});

describe("analyzeAccessBehavior", () => {
  beforeEach(() => {
    clearAccessPatterns();
  });

  it("returns low risk for first access (no pattern)", () => {
    const auth = makeAuth("new-key");
    const result = analyzeAccessBehavior(auth, "trips", "1.2.3.4");
    expect(result.riskLevel).toBe("low");
    expect(result.recommendedAction).toBe("allow");
    expect(result.riskScore).toBe(0);
  });

  it("returns low risk when access is from a known location", () => {
    const auth = makeAuth("key-known");
    // Establish a pattern
    updateAccessPattern("key-known", "stations", "10.0.0.1");
    // Access from the same IP
    const result = analyzeAccessBehavior(auth, "stations", "10.0.0.1");
    expect(result.riskLevel).toBe("low");
  });

  it("increases risk score for new access location", () => {
    const auth = makeAuth("key-new-loc");
    updateAccessPattern("key-new-loc", "trips", "10.0.0.1");
    // Access from a different IP
    const result = analyzeAccessBehavior(auth, "trips", "10.0.0.2");
    expect(result.riskScore).toBeGreaterThan(0);
    expect(result.riskFactors.length).toBeGreaterThan(0);
  });
});

describe("updateAccessPattern", () => {
  beforeEach(() => {
    clearAccessPatterns();
  });

  it("creates a new pattern on first access", () => {
    updateAccessPattern("key-1", "resource-a", "1.2.3.4");
    const stats = getAccessPatternStats();
    expect(stats.totalPatterns).toBe(1);
  });

  it("updates existing pattern on subsequent access", () => {
    updateAccessPattern("key-1", "resource-a", "1.2.3.4");
    updateAccessPattern("key-1", "resource-a", "5.6.7.8");
    const stats = getAccessPatternStats();
    // Still one pattern for this key:resource combo
    expect(stats.totalPatterns).toBe(1);
  });

  it("tracks multiple key:resource combinations separately", () => {
    updateAccessPattern("key-1", "resource-a", "1.2.3.4");
    updateAccessPattern("key-1", "resource-b", "1.2.3.4");
    updateAccessPattern("key-2", "resource-a", "1.2.3.4");
    const stats = getAccessPatternStats();
    expect(stats.totalPatterns).toBe(3);
  });
});

describe("clearAccessPatterns", () => {
  it("clears all patterns when no keyId given", () => {
    updateAccessPattern("key-a", "res", "1.1.1.1");
    updateAccessPattern("key-b", "res", "2.2.2.2");
    clearAccessPatterns();
    expect(getAccessPatternStats().totalPatterns).toBe(0);
  });

  it("clears only patterns for a specific keyId", () => {
    updateAccessPattern("key-a", "res", "1.1.1.1");
    updateAccessPattern("key-b", "res", "2.2.2.2");
    clearAccessPatterns("key-a");
    const stats = getAccessPatternStats();
    expect(stats.totalPatterns).toBe(1);
  });
});

describe("getAccessPatternStats", () => {
  beforeEach(() => {
    clearAccessPatterns();
  });

  it("returns zeros when no patterns exist", () => {
    const stats = getAccessPatternStats();
    expect(stats.totalPatterns).toBe(0);
    expect(stats.averageAccessCount).toBe(0);
    expect(stats.patternsByResourceType).toEqual({});
  });

  it("counts patterns by resource type", () => {
    updateAccessPattern("key-1", "trips", "1.2.3.4");
    updateAccessPattern("key-1", "trips", "1.2.3.4"); // same key+resource, updates
    updateAccessPattern("key-2", "stations", "1.2.3.4");

    const stats = getAccessPatternStats();
    expect(stats.patternsByResourceType["trips"]).toBe(1);
    expect(stats.patternsByResourceType["stations"]).toBe(1);
  });
});

describe("checkSessionSecurity", () => {
  it("returns not-secure when no sessionId is present", () => {
    const auth = {
      keyId: "k",
      scope: "read",
      rateLimitTier: 1,
      authMethod: "api_key",
    } as AuthContext;
    const result = checkSessionSecurity(auth, "1.2.3.4", "Mozilla/5.0");
    expect(result.secure).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("returns secure when sessionId is present with default config", () => {
    const auth = makeAuth();
    const result = checkSessionSecurity(auth, "1.2.3.4", "Mozilla/5.0");
    expect(result.secure).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("includes recommendations when IP binding is enforced", () => {
    const auth = makeAuth();
    const result = checkSessionSecurity(auth, "1.2.3.4", "Mozilla/5.0", {
      enforceIpBinding: true,
    });
    expect(result.recommendations.some((r) => /ip binding/i.test(r))).toBe(true);
  });

  it("includes recommendations when device binding is enforced", () => {
    const auth = makeAuth();
    const result = checkSessionSecurity(auth, "1.2.3.4", "Mozilla/5.0", {
      enforceDeviceBinding: true,
    });
    expect(result.recommendations.some((r) => /device binding/i.test(r))).toBe(true);
  });
});
