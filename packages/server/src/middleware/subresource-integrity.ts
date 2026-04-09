/**
 * Subresource Integrity (SRI) utilities.
 *
 * OWASP A08:2021 - Software and Data Integrity Failures
 *
 * Provides utilities for:
 * - Generating SRI hashes for external resources
 * - Validating SRI hashes
 * - Generating integrity attributes for HTML elements
 * - Supporting SHA-256, SHA-384, and SHA-512 algorithms
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

// ============================================================================
// Types
// ============================================================================

/**
 * Supported hash algorithms for SRI.
 */
export type SriHashAlgorithm = "sha256" | "sha384" | "sha512";

/**
 * SRI hash with algorithm and value.
 */
export interface SriHash {
  /** Hash algorithm (sha256, sha384, sha512) */
  algorithm: SriHashAlgorithm;
  /** Base64-encoded hash value */
  value: string;
}

/**
 * SRI attributes for HTML elements.
 */
export interface SriAttributes {
  /** The integrity attribute value */
  integrity: string;
  /** The crossorigin attribute (if required) */
  crossorigin?: "anonymous" | "use-credentials";
}

// ============================================================================
// Hash Generation
// ============================================================================

/**
 * Generate an SRI hash for a file.
 *
 * Reads the file content and computes the cryptographic hash
 * using the specified algorithm.
 */
export async function generateSriHash(
  filePath: string,
  algorithm: SriHashAlgorithm = "sha384"
): Promise<SriHash> {
  const content = await readFile(filePath);
  const hash = createHash(algorithm);
  hash.update(content);
  const digest = hash.digest("base64");

  return {
    algorithm,
    value: digest,
  };
}

/**
 * Generate an SRI hash for a string buffer.
 *
 * Computes the cryptographic hash of the provided buffer
 * using the specified algorithm.
 */
export function generateSriHashForBuffer(
  buffer: Buffer | string,
  algorithm: SriHashAlgorithm = "sha384"
): SriHash {
  const content = typeof buffer === "string" ? Buffer.from(buffer) : buffer;
  const hash = createHash(algorithm);
  hash.update(content);
  const digest = hash.digest("base64");

  return {
    algorithm,
    value: digest,
  };
}

/**
 * Generate an SRI hash for a URL's content.
 *
 * Fetches the URL content and computes the cryptographic hash.
 * Useful for third-party CDN resources.
 */
export async function generateSriHashForUrl(
  url: string,
  algorithm: SriHashAlgorithm = "sha384",
  timeoutMs: number = 30000
): Promise<SriHash> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return generateSriHashForBuffer(buffer, algorithm);
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================================
// Hash Formatting
// ============================================================================

/**
 * Format an SRI hash as an integrity attribute value.
 *
 * Converts the hash object to the format used in HTML:
 * "{algorithm}-{hash}"
 */
export function formatSriHash(hash: SriHash): string {
  return `${hash.algorithm}-${hash.value}`;
}

/**
 * Format multiple SRI hashes for an integrity attribute.
 *
 * Multiple hashes provide fallback support for different browsers.
 */
export function formatMultipleSriHashes(hashes: SriHash[]): string {
  return hashes.map(formatSriHash).join(" ");
}

// ============================================================================
// Hash Validation
// ============================================================================

/**
 * Validate an SRI hash against file content.
 *
 * Computes the hash of the file and compares it with the expected hash.
 */
export async function validateSriHash(filePath: string, expectedHash: SriHash): Promise<boolean> {
  const actualHash = await generateSriHash(filePath, expectedHash.algorithm);
  return actualHash.value === expectedHash.value;
}

/**
 * Validate an SRI hash against buffer content.
 */
export function validateSriHashForBuffer(buffer: Buffer | string, expectedHash: SriHash): boolean {
  const actualHash = generateSriHashForBuffer(buffer, expectedHash.algorithm);
  return actualHash.value === expectedHash.value;
}

/**
 * Parse an integrity attribute string into SRI hash objects.
 *
 * Parses strings like "sha384-abc123 sha256-def456" into an array of hashes.
 */
export function parseIntegrityAttribute(integrity: string): SriHash[] {
  const hashes: SriHash[] = [];

  for (const part of integrity.split(/\s+/)) {
    const match = part.match(/^(sha256|sha384|sha512)-([a-zA-Z0-9+/=]+)$/);
    if (match) {
      hashes.push({
        algorithm: match[1] as SriHashAlgorithm,
        value: match[2],
      });
    }
  }

  return hashes;
}

/**
 * Validate an integrity attribute against buffer content.
 *
 * Checks if any of the hashes in the integrity attribute match the content.
 */
export function validateIntegrityAttribute(buffer: Buffer | string, integrity: string): boolean {
  const expectedHashes = parseIntegrityAttribute(integrity);

  for (const expectedHash of expectedHashes) {
    if (validateSriHashForBuffer(buffer, expectedHash)) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// HTML Attribute Generation
// ============================================================================

/**
 * Generate SRI attributes for an HTML script or link element.
 *
 * Returns an object with integrity and crossorigin attributes
 * suitable for use in template rendering.
 */
export function generateSriAttributes(
  hashOrHashes: SriHash | SriHash[],
  crossorigin?: "anonymous" | "use-credentials"
): SriAttributes {
  const hashes = Array.isArray(hashOrHashes) ? hashOrHashes : [hashOrHashes];
  const integrity = formatMultipleSriHashes(hashes);

  const attributes: SriAttributes = {
    integrity,
  };

  if (crossorigin) {
    attributes.crossorigin = crossorigin;
  }

  return attributes;
}

/**
 * Validate SRI attributes from a request.
 *
 * Parses and validates the integrity attribute from request parameters.
 */
export function validateSriAttributes(
  content: Buffer | string,
  attributes: SriAttributes
): boolean {
  if (!attributes.integrity) {
    return false;
  }

  return validateIntegrityAttribute(content, attributes.integrity);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate SRI hashes for common third-party libraries.
 *
 * Pre-computed hashes for popular CDN resources.
 * In production, these should be computed and stored during build.
 */
export const COMMON_SRI_HASHES: Record<string, SriHash[]> = {
  // Example hashes (replace with actual computed hashes)
  "react@18.2.0": [
    {
      algorithm: "sha384",
      value: "示例哈希值，应该替换为实际计算值",
    },
  ],
  "react-dom@18.2.0": [
    {
      algorithm: "sha384",
      value: "示例哈希值，应该替换为实际计算值",
    },
  ],
};

/**
 * Get SRI hash for a library version.
 *
 * Looks up pre-computed hashes for common libraries.
 */
export function getLibrarySriHash(libraryName: string, version: string): SriHash[] | undefined {
  const key = `${libraryName}@${version}`;
  return COMMON_SRI_HASHES[key];
}

/**
 * Generate integrity metadata for a bundle of files.
 *
 * Useful for generating SRI manifests during build time.
 */
export async function generateSriManifest(
  files: Record<string, string>,
  algorithm: SriHashAlgorithm = "sha384"
): Promise<Record<string, string>> {
  const manifest: Record<string, string> = {};

  for (const [name, filePath] of Object.entries(files)) {
    const hash = await generateSriHash(filePath, algorithm);
    manifest[name] = formatSriHash(hash);
  }

  return manifest;
}
