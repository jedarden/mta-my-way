/**
 * Dependency security utilities.
 *
 * OWASP A06:2021 - Vulnerable and Outdated Components
 *
 * Provides utilities for:
 * - Checking for known vulnerabilities in dependencies
 * - Validating dependency versions
 * - Generating security reports
 * - Monitoring for outdated packages
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "../observability/logger.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Dependency information.
 */
export interface DependencyInfo {
  /** Package name */
  name: string;
  /** Version string */
  version: string;
  /** Whether it's a dev dependency */
  dev: boolean;
  /** Whether it's an optional dependency */
  optional: boolean;
}

/**
 * Vulnerability severity levels.
 */
export type VulnerabilitySeverity = "low" | "moderate" | "high" | "critical";

/**
 * Vulnerability information.
 */
export interface Vulnerability {
  /** Vulnerability ID (e.g., CVE-2021-12345) */
  id: string;
  /** Vulnerability title */
  title: string;
  /** Severity level */
  severity: VulnerabilitySeverity;
  /** CVE ID */
  cve?: string;
  /** Vulnerable version range */
  vulnerableVersions: string[];
  /** Patched version range */
  patchedVersions: string[];
  /** Vulnerability description */
  description: string;
  /** Reference URLs */
  references: string[];
  /** Recommendation */
  recommendation: string;
}

/**
 * Dependency security report.
 */
export interface SecurityReport {
  /** Timestamp of the report */
  timestamp: string;
  /** Total dependencies checked */
  totalDependencies: number;
  /** Number of vulnerabilities found */
  totalVulnerabilities: number;
  /** Vulnerabilities by severity */
  vulnerabilitiesBySeverity: Record<VulnerabilitySeverity, number>;
  /** Vulnerabilities by package */
  vulnerabilities: Record<string, Vulnerability[]>;
  /** Outdated dependencies */
  outdatedDependencies: Array<{
    name: string;
    current: string;
    latest: string;
  }>;
}

/**
 * Security audit options.
 */
export interface SecurityAuditOptions {
  /** Include dev dependencies (default: true) */
  includeDev?: boolean;
  /** Include optional dependencies (default: true) */
  includeOptional?: boolean;
  /** Check for outdated packages (default: true) */
  checkOutdated?: boolean;
  /** Severity threshold to report (default: 'low') */
  severityThreshold?: VulnerabilitySeverity;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Known vulnerability database.
 * In production, this should be fetched from sources like:
 * - npm audit
 * - GitHub Advisory Database
 * - Snyk
 * - OWASP Dependency-Check
 */
const KNOWN_VULNERABILITIES: Record<string, Vulnerability[]> = {
  // Example vulnerabilities (replace with real data from audit sources)
  axios: [
    {
      id: "GHSA-4w2h-qjvm-wxgp",
      title: "Axios SSRF Filter Bypass",
      severity: "high",
      cve: "CVE-2023-45857",
      vulnerableVersions: ["<1.6.0"],
      patchedVersions: [">=1.6.0"],
      description:
        "An attacker could bypass the SSRF filter and redirect requests to unintended addresses.",
      references: [
        "https://nvd.nist.gov/vuln/detail/CVE-2023-45857",
        "https://github.com/axios/axios/security/advisories/GHSA-4w2h-qjvm-wxgp",
      ],
      recommendation: "Upgrade to version 1.6.0 or later",
    },
  ],
  lodash: [
    {
      id: "GHSA-p6mc-m468-83gw",
      title: "Lodash Prototype Pollution",
      severity: "high",
      cve: "CVE-2021-23337",
      vulnerableVersions: ["<4.17.21"],
      patchedVersions: [">=4.17.21"],
      description: "A prototype pollution vulnerability in zipObjectDeep function.",
      references: ["https://nvd.nist.gov/vuln/detail/CVE-2021-23337"],
      recommendation: "Upgrade to version 4.17.21 or later",
    },
  ],
};

/**
 * Severity order for comparison.
 */
const SEVERITY_ORDER: Record<VulnerabilitySeverity, number> = {
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

// ============================================================================
// Version Comparison
// ============================================================================

/**
 * Compare two semver versions.
 * Returns -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2.
 */
export function compareVersions(v1: string, v2: string): number {
  const normalize = (v: string) => v.replace(/^v|^=/, "").trim();
  const parts1 = normalize(v1).split(".").map(Number);
  const parts2 = normalize(v2).split(".").map(Number);

  const maxLength = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < maxLength; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;

    if (p1 < p2) return -1;
    if (p1 > p2) return 1;
  }

  return 0;
}

/**
 * Check if a version is within a vulnerable range.
 */
export function isVulnerableVersion(version: string, vulnerableRanges: string[]): boolean {
  for (const range of vulnerableRanges) {
    // Simple range matching (in production, use semver library)
    if (range.startsWith("<")) {
      const minVersion = range.slice(1);
      if (compareVersions(version, minVersion) < 0) {
        return true;
      }
    } else if (range.startsWith("<=")) {
      const maxVersion = range.slice(2);
      if (compareVersions(version, maxVersion) <= 0) {
        return true;
      }
    } else if (range.startsWith(">")) {
      const minVersion = range.slice(1);
      if (compareVersions(version, minVersion) > 0) {
        return true;
      }
    } else if (range.startsWith(">=")) {
      const minVersion = range.slice(2);
      if (compareVersions(version, minVersion) >= 0) {
        return true;
      }
    } else if (range.startsWith("=")) {
      const exactVersion = range.slice(1);
      if (compareVersions(version, exactVersion) === 0) {
        return true;
      }
    } else {
      // Exact match
      if (compareVersions(version, range) === 0) {
        return true;
      }
    }
  }
  return false;
}

// ============================================================================
// Dependency Parsing
// ============================================================================

/**
 * Parse package.json and return dependency information.
 */
export async function parseDependencies(
  packageJsonPath: string,
  options: SecurityAuditOptions = {}
): Promise<DependencyInfo[]> {
  const { includeDev = true, includeOptional = true } = options;

  if (!existsSync(packageJsonPath)) {
    throw new Error(`package.json not found at ${packageJsonPath}`);
  }

  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8"));
  const dependencies: DependencyInfo[] = [];

  // Add regular dependencies
  if (packageJson.dependencies) {
    for (const [name, version] of Object.entries(packageJson.dependencies)) {
      dependencies.push({
        name,
        version: version as string,
        dev: false,
        optional: false,
      });
    }
  }

  // Add dev dependencies
  if (includeDev && packageJson.devDependencies) {
    for (const [name, version] of Object.entries(packageJson.devDependencies)) {
      dependencies.push({
        name,
        version: version as string,
        dev: true,
        optional: false,
      });
    }
  }

  // Add optional dependencies
  if (includeOptional && packageJson.optionalDependencies) {
    for (const [name, version] of Object.entries(packageJson.optionalDependencies)) {
      dependencies.push({
        name,
        version: version as string,
        dev: false,
        optional: true,
      });
    }
  }

  return dependencies;
}

/**
 * Clean a version string by removing prefixes and suffixes.
 */
function cleanVersion(version: string): string {
  return version
    .replace(/^[\^~]/, "")
    .replace(/>=?|<=?|<|>|=/, "")
    .split(" ")[0]
    .trim();
}

// ============================================================================
// Security Auditing
// ============================================================================

/**
 * Audit dependencies for known vulnerabilities.
 */
export async function auditDependencies(
  dependencies: DependencyInfo[],
  options: SecurityAuditOptions = {}
): Promise<Map<string, Vulnerability[]>> {
  const vulnerabilities = new Map<string, Vulnerability[]>();
  const { severityThreshold = "low" } = options;
  const thresholdLevel = SEVERITY_ORDER[severityThreshold];

  for (const dep of dependencies) {
    const packageVulnerabilities: Vulnerability[] = [];

    // Check known vulnerabilities
    const knownVulns = KNOWN_VULNERABILITIES[dep.name];
    if (knownVulns) {
      for (const vuln of knownVulns) {
        // Check severity threshold
        if (SEVERITY_ORDER[vuln.severity] < thresholdLevel) {
          continue;
        }

        // Check if version is vulnerable
        const cleanVer = cleanVersion(dep.version);
        if (isVulnerableVersion(cleanVer, vuln.vulnerableVersions)) {
          packageVulnerabilities.push(vuln);
        }
      }
    }

    if (packageVulnerabilities.length > 0) {
      vulnerabilities.set(dep.name, packageVulnerabilities);
    }
  }

  return vulnerabilities;
}

/**
 * Generate a security report for dependencies.
 */
export async function generateSecurityReport(
  packageJsonPath: string,
  options: SecurityAuditOptions = {}
): Promise<SecurityReport> {
  const dependencies = await parseDependencies(packageJsonPath, options);
  const vulnerabilities = await auditDependencies(dependencies, options);

  const vulnerabilitiesBySeverity: Record<VulnerabilitySeverity, number> = {
    low: 0,
    moderate: 0,
    high: 0,
    critical: 0,
  };

  const vulnerabilitiesByPackage: Record<string, Vulnerability[]> = {};

  for (const [packageName, packageVulns] of vulnerabilities.entries()) {
    vulnerabilitiesByPackage[packageName] = packageVulns;

    for (const vuln of packageVulns) {
      vulnerabilitiesBySeverity[vuln.severity]++;
    }
  }

  const totalVulnerabilities = Object.values(vulnerabilitiesBySeverity).reduce(
    (sum, count) => sum + count,
    0
  );

  return {
    timestamp: new Date().toISOString(),
    totalDependencies: dependencies.length,
    totalVulnerabilities,
    vulnerabilitiesBySeverity,
    vulnerabilities: vulnerabilitiesByPackage,
    outdatedDependencies: [],
  };
}

/**
 * Run a security audit and log the results.
 */
export async function runSecurityAudit(
  packageJsonPath: string,
  options: SecurityAuditOptions = {}
): Promise<SecurityReport> {
  const report = await generateSecurityReport(packageJsonPath, options);

  if (report.totalVulnerabilities > 0) {
    logger.warn("Security vulnerabilities found", {
      total: report.totalVulnerabilities,
      critical: report.vulnerabilitiesBySeverity.critical,
      high: report.vulnerabilitiesBySeverity.high,
      moderate: report.vulnerabilitiesBySeverity.moderate,
      low: report.vulnerabilitiesBySeverity.low,
    });

    // Log each vulnerability
    for (const [packageName, vulns] of Object.entries(report.vulnerabilities)) {
      for (const vuln of vulns) {
        logger.warn("Vulnerability details", {
          package: packageName,
          id: vuln.id,
          severity: vuln.severity,
          cve: vuln.cve,
          recommendation: vuln.recommendation,
        });
      }
    }
  } else {
    logger.info("No security vulnerabilities found");
  }

  return report;
}

/**
 * Check if a package meets security requirements.
 */
export function isPackageSecure(
  packageName: string,
  version: string,
  severityThreshold: VulnerabilitySeverity = "moderate"
): boolean {
  const vulnerabilities = KNOWN_VULNERABILITIES[packageName];
  if (!vulnerabilities) {
    return true; // No known vulnerabilities
  }

  const thresholdLevel = SEVERITY_ORDER[severityThreshold];

  for (const vuln of vulnerabilities) {
    if (SEVERITY_ORDER[vuln.severity] >= thresholdLevel) {
      if (isVulnerableVersion(version, vuln.vulnerableVersions)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Get security recommendations for a package.
 */
export function getSecurityRecommendations(packageName: string, version: string): string[] {
  const recommendations: string[] = [];
  const vulnerabilities = KNOWN_VULNERABILITIES[packageName];

  if (!vulnerabilities) {
    return recommendations;
  }

  for (const vuln of vulnerabilities) {
    if (isVulnerableVersion(version, vuln.vulnerableVersions)) {
      recommendations.push(vuln.recommendation);
    }
  }

  return recommendations;
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * Security check middleware that runs on startup.
 *
 * Logs a warning if vulnerabilities are found in dependencies.
 * In production, this should block startup if critical vulnerabilities are found.
 */
export function securityCheckOnStartup(
  packageJsonPath: string,
  options: SecurityAuditOptions = {}
): void {
  // Run security check asynchronously
  void (async () => {
    try {
      const report = await runSecurityAudit(packageJsonPath, options);

      // In production, you might want to exit if critical vulnerabilities are found
      if (report.vulnerabilitiesBySeverity.critical > 0) {
        logger.error("Critical vulnerabilities detected", {
          count: report.vulnerabilitiesBySeverity.critical,
          message: "Consider blocking startup",
        });
      }
    } catch (error) {
      logger.error("Security check failed", error as Error);
    }
  })();
}
