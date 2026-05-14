#!/usr/bin/env node

/**
 * Security audit CLI script.
 *
 * Performs comprehensive security checks including:
 * - Dependency vulnerability scanning
 * - Configuration validation
 * - Code security patterns
 * - Environment variable checks
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function colorize(color, text) {
  return `${colors[color]}${text}${colors.reset}`;
}

// ============================================================================
// Vulnerability Scanning
// ============================================================================

function checkDependencies() {
  console.log(colorize("cyan", "\n📦 Checking dependencies for vulnerabilities..."));

  const issues = [];

  try {
    const packageJsonPath = join(__dirname, "../../package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    // Check for known vulnerable packages
    const vulnerablePackages = {
      "axios": "< 1.7.0",
      "lodash": "< 4.17.21",
      "express": "< 4.19.0",
      "minimist": "< 1.2.6",
      "ws": "< 8.0.0",
      "debug": "< 4.3.1",
      "pathval": "< 1.1.1",
      "yaml": "< 2.0.0",
    };

    for (const [pkg, minVersion] of Object.entries(vulnerablePackages)) {
      if (allDeps[pkg]) {
        const installedVersion = allDeps[pkg].replace(/^[\^~]/, "");
        if (installedVersion < minVersion.replace(/^[\^~<]/, "")) {
          issues.push({
            type: "vulnerability",
            severity: "high",
            package: pkg,
            message: `Known vulnerable version: ${installedVersion} (should be >=${minVersion})`,
          });
        }
      }
    }

    if (issues.length === 0) {
      console.log(colorize("green", "   ✓ No known vulnerable dependencies found"));
    } else {
      console.log(colorize("red", `   ✗ Found ${issues.length} vulnerable dependencies`));
      for (const issue of issues) {
        console.log(colorize("red", `     - ${issue.package}: ${issue.message}`));
      }
    }
  } catch (error) {
    console.log(colorize("yellow", "   ⚠ Could not check dependencies"));
  }

  return issues;
}

// ============================================================================
// Configuration Security Checks
// ============================================================================

function checkConfiguration() {
  console.log(colorize("cyan", "\n🔧 Checking configuration security..."));

  const issues = [];

  // Check for hardcoded secrets
  const envFiles = [".env", ".env.local", ".env.production"];
  for (const file of envFiles) {
    try {
      const envPath = join(__dirname, "../../", file);
      const content = readFileSync(envPath, "utf-8");

      // Check for dangerous patterns
      const patterns = [
        { regex: /password\s*=\s*.+/i, name: "Hardcoded password" },
        { regex: /secret\s*=\s*.+/i, name: "Hardcoded secret" },
        { regex: /api[_-]?key\s*=\s*.+/i, name: "Hardcoded API key" },
        { regex: /token\s*=\s*.+/i, name: "Hardcoded token" },
      ];

      for (const pattern of patterns) {
        if (pattern.regex.test(content)) {
          issues.push({
            type: "configuration",
            severity: "high",
            file,
            message: `${pattern.name} found in ${file}`,
          });
        }
      }
    } catch {
      // File doesn't exist, skip
    }
  }

  // Check TypeScript config for security
  const tsconfigPath = join(__dirname, "../../tsconfig.json");
  try {
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf-8"));

    // Check if strict mode is enabled
    if (!tsconfig.compilerOptions?.strict) {
      issues.push({
        type: "configuration",
        severity: "low",
        file: "tsconfig.json",
        message: "TypeScript strict mode not enabled",
      });
    }
  } catch {
    // Skip if file not found
  }

  if (issues.length === 0) {
    console.log(colorize("green", "   ✓ Configuration security looks good"));
  } else {
    console.log(colorize("yellow", `   ⚠ Found ${issues.length} configuration issues`));
    for (const issue of issues) {
      const color = issue.severity === "high" ? "red" : "yellow";
      console.log(colorize(color, `     - ${issue.message}`));
    }
  }

  return issues;
}

// ============================================================================
// Code Security Pattern Checks
// ============================================================================

function checkCodePatterns() {
  console.log(colorize("cyan", "\n🔍 Checking code security patterns..."));

  const issues = [];
  const srcDir = join(__dirname, "../src");

  function scanDirectory(dir) {
    try {
      const files = readdirSync(dir);
      for (const file of files) {
        const fullPath = join(dir, file);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          scanDirectory(fullPath);
        } else if (file.endsWith(".ts")) {
          const content = readFileSync(fullPath, "utf-8");
          const relativePath = fullPath.replace(join(__dirname, "../../"), "");

          // Check for eval()
          if (/\beval\s*\(/.test(content)) {
            issues.push({
              type: "code",
              severity: "high",
              file: relativePath,
              message: "Use of eval() detected",
            });
          }

          // Check for innerHTML
          if (/\.innerHTML\s*=/.test(content)) {
            issues.push({
              type: "code",
              severity: "medium",
              file: relativePath,
              message: "Use of innerHTML detected (XSS risk)",
            });
          }

          // Check for dangerous regex patterns
          if (/(?:new RegExp|String\.raw)\s*\(\s*["'].*\+.*["']\s*\)/.test(content)) {
            issues.push({
              type: "code",
              severity: "medium",
              file: relativePath,
              message: "Dynamic regex construction detected (ReDoS risk)",
            });
          }

          // Check for console.log in production code
          if (/console\.log\(/.test(content) && !relativePath.includes(".test.")) {
            issues.push({
              type: "code",
              severity: "low",
              file: relativePath,
              message: "console.log() found in production code",
            });
          }
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
  }

  scanDirectory(srcDir);

  if (issues.length === 0) {
    console.log(colorize("green", "   ✓ No dangerous code patterns found"));
  } else {
    console.log(colorize("yellow", `   ⚠ Found ${issues.length} code pattern issues`));
    for (const issue of issues) {
      const color = issue.severity === "high" ? "red" : "yellow";
      console.log(colorize(color, `     - ${issue.file}: ${issue.message}`));
    }
  }

  return issues;
}

// ============================================================================
// Environment Variable Checks
// ============================================================================

function checkEnvironmentVariables() {
  console.log(colorize("cyan", "\n🌍 Checking environment variables..."));

  const issues = [];

  // Required environment variables
  const requiredVars = [
    "NODE_ENV",
  ];

  // Recommended environment variables
  const recommendedVars = [
    "DATABASE_PATH",
    "SESSION_SECRET",
  ];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      issues.push({
        type: "environment",
        severity: "high",
        variable: varName,
        message: `Required environment variable ${varName} is not set`,
      });
    }
  }

  for (const varName of recommendedVars) {
    if (!process.env[varName]) {
      issues.push({
        type: "environment",
        severity: "low",
        variable: varName,
        message: `Recommended environment variable ${varName} is not set`,
      });
    }
  }

  // Check if running in production
  if (process.env.NODE_ENV === "production") {
    // Check for development-only settings
    if (process.env.DEBUG || process.env.VERBOSE) {
      issues.push({
        type: "environment",
        severity: "medium",
        message: "Development debug flags enabled in production",
      });
    }
  }

  if (issues.length === 0) {
    console.log(colorize("green", "   ✓ Environment variables configured correctly"));
  } else {
    console.log(colorize("yellow", `   ⚠ Found ${issues.length} environment issues`));
    for (const issue of issues) {
      const color = issue.severity === "high" ? "red" : "yellow";
      console.log(colorize(color, `     - ${issue.message}`));
    }
  }

  return issues;
}

// ============================================================================
// Header Security Checks
// ============================================================================

function checkSecurityHeaders() {
  console.log(colorize("cyan", "\n🔒 Checking security header configuration..."));

  const issues = [];

  // Check if security headers middleware exists
  const securityHeadersPath = join(__dirname, "../src/middleware/security-headers.ts");
  try {
    const content = readFileSync(securityHeadersPath, "utf-8");

    const requiredHeaders = [
      "Content-Security-Policy",
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Strict-Transport-Security",
      "Permissions-Policy",
    ];

    for (const header of requiredHeaders) {
      if (!content.includes(header)) {
        issues.push({
          type: "headers",
          severity: "medium",
          message: `Security header ${header} not found`,
        });
      }
    }
  } catch {
    issues.push({
      type: "headers",
      severity: "high",
      message: "Security headers middleware not found",
    });
  }

  if (issues.length === 0) {
    console.log(colorize("green", "   ✓ Security headers properly configured"));
  } else {
    console.log(colorize("yellow", `   ⚠ Found ${issues.length} header issues`));
    for (const issue of issues) {
      console.log(colorize("yellow", `     - ${issue.message}`));
    }
  }

  return issues;
}

// ============================================================================
// Main Audit Function
// ============================================================================

async function runAudit() {
  console.log(colorize("magenta", "\n🔐 Security Audit Report"));
  console.log(colorize("magenta", "=".repeat(50)));

  const startTime = Date.now();
  const allIssues = {
    dependencies: checkDependencies(),
    configuration: checkConfiguration(),
    codePatterns: checkCodePatterns(),
    environment: checkEnvironmentVariables(),
    headers: checkSecurityHeaders(),
  };

  const totalIssues = Object.values(allIssues).reduce((sum, issues) => sum + issues.length, 0);
  const highSeverityIssues = Object.values(allIssues)
    .flat()
    .filter((i) => i.severity === "high").length;
  const duration = Date.now() - startTime;

  // Summary
  console.log(colorize("cyan", "\n📊 Summary"));
  console.log(colorize("cyan", "=".repeat(50)));

  if (totalIssues === 0) {
    console.log(colorize("green", "\n✅ All security checks passed!"));
  } else {
    console.log(colorize("yellow", `\n⚠ Found ${totalIssues} total issues (${highSeverityIssues} high severity)`));

    const breakdown = {
      dependencies: allIssues.dependencies.length,
      configuration: allIssues.configuration.length,
      codePatterns: allIssues.codePatterns.length,
      environment: allIssues.environment.length,
      headers: allIssues.headers.length,
    };

    console.log("\nBreakdown:");
    for (const [category, count] of Object.entries(breakdown)) {
      if (count > 0) {
        console.log(`  ${category}: ${count}`);
      }
    }

    console.log("\nRecommendations:");
    if (highSeverityIssues > 0) {
      console.log(colorize("red", "  - Address high-severity issues immediately"));
    }
    console.log(colorize("yellow", "  - Review medium-severity issues for potential impact"));
    console.log(colorize("blue", "  - Consider addressing low-severity issues for best practices"));
  }

  console.log(`\nCompleted in ${duration}ms\n`);

  // Exit with appropriate code
  process.exit(highSeverityIssues > 0 ? 1 : 0);
}

// Run the audit
runAudit().catch((error) => {
  console.error(colorize("red", "Error running audit:"), error);
  process.exit(1);
});
