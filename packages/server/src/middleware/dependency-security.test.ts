/**
 * Tests for dependency security utilities.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock fs modules before importing the module under test
// Using factory functions to avoid hoisting issues with variables
vi.mock("node:fs/promises", async () => {
  const mod = await vi.importActual("node:fs/promises");
  return {
    ...mod,
    readFile: vi.fn(),
    writeFile: vi.fn(),
  };
});

vi.mock("node:fs", async () => {
  const mod = await vi.importActual("node:fs");
  return {
    ...mod,
    existsSync: vi.fn(),
  };
});

import {
  auditDependencies,
  compareVersions,
  generateSecurityReport,
  getSecurityRecommendations,
  isPackageSecure,
  isVulnerableVersion,
  parseDependencies,
  runSecurityAudit,
  securityCheckOnStartup,
} from "./dependency-security.js";

describe("compareVersions", () => {
  it("returns -1 when first version is lower", () => {
    expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
    expect(compareVersions("1.2.3", "1.2.4")).toBe(-1);
  });

  it("returns 1 when first version is higher", () => {
    expect(compareVersions("2.0.0", "1.0.0")).toBe(1);
    expect(compareVersions("1.2.4", "1.2.3")).toBe(1);
  });

  it("returns 0 when versions are equal", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("2.5.10", "2.5.10")).toBe(0);
  });

  it("handles versions with different lengths", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.0", "1.0")).toBe(0);
    expect(compareVersions("1.0.0.0", "1.0")).toBe(0);
  });

  it("handles version prefixes", () => {
    expect(compareVersions("v1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("=1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("^1.0.0", "1.0.0")).toBe(0);
  });
});

describe("isVulnerableVersion", () => {
  it("detects versions less than threshold", () => {
    expect(isVulnerableVersion("1.5.0", ["<1.6.0"])).toBe(true);
    expect(isVulnerableVersion("1.0.0", ["<1.6.0"])).toBe(true);
  });

  it("allows versions at or above threshold", () => {
    expect(isVulnerableVersion("1.6.0", ["<1.6.0"])).toBe(false);
    expect(isVulnerableVersion("2.0.0", ["<1.6.0"])).toBe(false);
  });

  it("detects versions less than or equal to threshold", () => {
    expect(isVulnerableVersion("1.6.0", ["<=1.6.0"])).toBe(true);
    expect(isVulnerableVersion("1.5.0", ["<=1.6.0"])).toBe(true);
  });

  it("allows versions above threshold", () => {
    expect(isVulnerableVersion("1.6.1", ["<=1.6.0"])).toBe(false);
  });

  it("detects versions greater than threshold", () => {
    expect(isVulnerableVersion("2.0.0", [">1.6.0"])).toBe(true);
  });

  it("allows versions at or below threshold", () => {
    expect(isVulnerableVersion("1.6.0", [">1.6.0"])).toBe(false);
  });

  it("handles exact version matches", () => {
    expect(isVulnerableVersion("1.6.0", ["=1.6.0"])).toBe(true);
    expect(isVulnerableVersion("1.6.1", ["=1.6.0"])).toBe(false);
  });

  it("handles multiple ranges", () => {
    expect(isVulnerableVersion("1.5.0", ["<1.0.0", ">1.4.0"])).toBe(true);
    expect(isVulnerableVersion("0.9.0", ["<1.0.0", ">1.4.0"])).toBe(true);
    expect(isVulnerableVersion("1.2.0", ["<1.0.0", ">1.4.0"])).toBe(false);
  });
});

describe("isPackageSecure", () => {
  it("returns true for packages with no known vulnerabilities", () => {
    expect(isPackageSecure("unknown-package", "1.0.0")).toBe(true);
  });

  it("returns true for secure versions", () => {
    expect(isPackageSecure("axios", "1.6.0")).toBe(true);
  });

  it("returns false for vulnerable versions", () => {
    expect(isPackageSecure("axios", "1.5.0")).toBe(false);
  });

  it("respects severity threshold", () => {
    // With high threshold, moderate vulnerabilities are ignored
    expect(isPackageSecure("axios", "1.5.0", "high")).toBe(true);
    expect(isPackageSecure("axios", "1.5.0", "low")).toBe(false);
  });
});

describe("getSecurityRecommendations", () => {
  it("returns empty array for secure packages", () => {
    const recommendations = getSecurityRecommendations("axios", "1.6.0");
    expect(recommendations).toEqual([]);
  });

  it("returns recommendations for vulnerable packages", () => {
    const recommendations = getSecurityRecommendations("axios", "1.5.0");
    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations[0]).toContain("Upgrade");
  });

  it("returns empty array for unknown packages", () => {
    const recommendations = getSecurityRecommendations("unknown-package", "1.0.0");
    expect(recommendations).toEqual([]);
  });
});

describe("parseDependencies", () => {
  it("throws error for non-existent package.json", async () => {
    await expect(parseDependencies("/nonexistent/package.json")).rejects.toThrow();
  });

  it("parses dependencies from package.json", async () => {
    const mockPackageJson = {
      dependencies: {
        axios: "^1.6.0",
        lodash: "^4.17.21",
      },
    };

    const readFileSpy = vi
      .spyOn(await import("node:fs/promises"), "readFile")
      .mockResolvedValue(JSON.stringify(mockPackageJson));

    const existsSyncSpy = vi.spyOn(await import("node:fs"), "existsSync").mockReturnValue(true);

    const deps = await parseDependencies("/fake/package.json");

    expect(deps).toHaveLength(2);
    expect(deps[0]?.name).toBe("axios");
    expect(deps[0]?.dev).toBe(false);
    expect(deps[1]?.name).toBe("lodash");

    readFileSpy.mockRestore();
    existsSyncSpy.mockRestore();
  });

  it("includes dev dependencies when includeDev is true", async () => {
    const mockPackageJson = {
      dependencies: {
        axios: "^1.6.0",
      },
      devDependencies: {
        vitest: "^1.0.0",
      },
    };

    const readFileSpy = vi
      .spyOn(await import("node:fs/promises"), "readFile")
      .mockResolvedValue(JSON.stringify(mockPackageJson));

    const existsSyncSpy = vi.spyOn(await import("node:fs"), "existsSync").mockReturnValue(true);

    const deps = await parseDependencies("/fake/package.json", { includeDev: true });

    expect(deps).toHaveLength(2);
    expect(deps.some((d) => d.name === "vitest" && d.dev)).toBe(true);

    readFileSpy.mockRestore();
    existsSyncSpy.mockRestore();
  });

  it("excludes dev dependencies when includeDev is false", async () => {
    const mockPackageJson = {
      dependencies: {
        axios: "^1.6.0",
      },
      devDependencies: {
        vitest: "^1.0.0",
      },
    };

    const readFileSpy = vi
      .spyOn(await import("node:fs/promises"), "readFile")
      .mockResolvedValue(JSON.stringify(mockPackageJson));

    const existsSyncSpy = vi.spyOn(await import("node:fs"), "existsSync").mockReturnValue(true);

    const deps = await parseDependencies("/fake/package.json", { includeDev: false });

    expect(deps).toHaveLength(1);
    expect(deps[0]?.name).toBe("axios");

    readFileSpy.mockRestore();
    existsSyncSpy.mockRestore();
  });
});

describe("auditDependencies", () => {
  it("returns empty map for secure dependencies", async () => {
    const deps = [{ name: "axios", version: "^1.6.0", dev: false, optional: false }];

    const vulnerabilities = await auditDependencies(deps);

    expect(vulnerabilities.size).toBe(0);
  });

  it("detects vulnerable dependencies", async () => {
    const deps = [{ name: "axios", version: "^1.5.0", dev: false, optional: false }];

    const vulnerabilities = await auditDependencies(deps);

    expect(vulnerabilities.size).toBe(1);
    expect(vulnerabilities.has("axios")).toBe(true);
    expect(vulnerabilities.get("axios")).toHaveLength(1);
  });

  it("filters by severity threshold", async () => {
    const deps = [{ name: "axios", version: "^1.5.0", dev: false, optional: false }];

    const vulnerabilities = await auditDependencies(deps, { severityThreshold: "critical" });

    // Axios vulnerability is high, not critical
    expect(vulnerabilities.size).toBe(0);
  });
});

describe("generateSecurityReport", () => {
  it("generates report with no vulnerabilities", async () => {
    const mockPackageJson = {
      dependencies: {
        axios: "^1.6.0",
      },
    };

    const readFileSpy = vi
      .spyOn(await import("node:fs/promises"), "readFile")
      .mockResolvedValue(JSON.stringify(mockPackageJson));

    const existsSyncSpy = vi.spyOn(await import("node:fs"), "existsSync").mockReturnValue(true);

    const report = await generateSecurityReport("/fake/package.json");

    expect(report.totalDependencies).toBe(1);
    expect(report.totalVulnerabilities).toBe(0);
    expect(report.vulnerabilitiesBySeverity.low).toBe(0);
    expect(report.vulnerabilitiesBySeverity.critical).toBe(0);

    readFileSpy.mockRestore();
    existsSyncSpy.mockRestore();
  });

  it("generates report with vulnerabilities", async () => {
    const mockPackageJson = {
      dependencies: {
        axios: "^1.5.0",
      },
    };

    const readFileSpy = vi
      .spyOn(await import("node:fs/promises"), "readFile")
      .mockResolvedValue(JSON.stringify(mockPackageJson));

    const existsSyncSpy = vi.spyOn(await import("node:fs"), "existsSync").mockReturnValue(true);

    const report = await generateSecurityReport("/fake/package.json");

    expect(report.totalDependencies).toBe(1);
    expect(report.totalVulnerabilities).toBeGreaterThan(0);
    expect(report.vulnerabilities).toHaveProperty("axios");

    readFileSpy.mockRestore();
    existsSyncSpy.mockRestore();
  });

  it("includes timestamp in report", async () => {
    const mockPackageJson = { dependencies: {} };

    const readFileSpy = vi
      .spyOn(await import("node:fs/promises"), "readFile")
      .mockResolvedValue(JSON.stringify(mockPackageJson));

    const existsSyncSpy = vi.spyOn(await import("node:fs"), "existsSync").mockReturnValue(true);

    const report = await generateSecurityReport("/fake/package.json");

    expect(report.timestamp).toBeDefined();
    expect(new Date(report.timestamp)).toBeInstanceOf(Date);

    readFileSpy.mockRestore();
    existsSyncSpy.mockRestore();
  });
});

describe("runSecurityAudit", () => {
  it("logs warning when vulnerabilities are found", async () => {
    const mockPackageJson = {
      dependencies: {
        axios: "^1.5.0",
      },
    };

    const readFileSpy = vi
      .spyOn(await import("node:fs/promises"), "readFile")
      .mockResolvedValue(JSON.stringify(mockPackageJson));

    const existsSyncSpy = vi.spyOn(await import("node:fs"), "existsSync").mockReturnValue(true);

    const loggerWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await runSecurityAudit("/fake/package.json");

    expect(loggerWarnSpy).toHaveBeenCalled();

    readFileSpy.mockRestore();
    existsSyncSpy.mockRestore();
    loggerWarnSpy.mockRestore();
  });

  it("logs info when no vulnerabilities found", async () => {
    const mockPackageJson = {
      dependencies: {
        "safe-package": "^1.0.0",
      },
    };

    const readFileSpy = vi
      .spyOn(await import("node:fs/promises"), "readFile")
      .mockResolvedValue(JSON.stringify(mockPackageJson));

    const existsSyncSpy = vi.spyOn(await import("node:fs"), "existsSync").mockReturnValue(true);

    // Spy on the logger module's info method
    const { logger } = await import("../observability/logger.js");
    const loggerInfoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});

    await runSecurityAudit("/fake/package.json");

    expect(loggerInfoSpy).toHaveBeenCalledWith("No security vulnerabilities found");

    readFileSpy.mockRestore();
    existsSyncSpy.mockRestore();
    loggerInfoSpy.mockRestore();
  });
});

describe("securityCheckOnStartup", () => {
  it("runs security check asynchronously", async () => {
    const mockPackageJson = { dependencies: {} };

    const readFileSpy = vi
      .spyOn(await import("node:fs/promises"), "readFile")
      .mockResolvedValue(JSON.stringify(mockPackageJson));

    const existsSyncSpy = vi.spyOn(await import("node:fs"), "existsSync").mockReturnValue(true);

    // Should not throw, runs async
    expect(() => {
      securityCheckOnStartup("/fake/package.json");
    }).not.toThrow();

    readFileSpy.mockRestore();
    existsSyncSpy.mockRestore();
  });
});
