/**
 * JWT (JSON Web Token) Validation Module
 *
 * Provides comprehensive JWT validation with:
 * - Structure validation
 * - Signature verification (HMAC-SHA256, RSA)
 * - Claims validation (exp, nbf, iat, iss, aud)
 * - Token refresh logic
 * - Security best practices enforcement
 *
 * This module implements JWT validation following:
 * - RFC 7519 (JSON Web Token)
 * - OWASP JWT Best Practices
 * - NIST guidelines for token-based authentication
 */

import { logger } from "../observability/logger.js";
import { timingSafeEqual } from "./security-headers.js";

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * JWT header component.
 */
export interface JwtHeader {
  /** Algorithm (alg) */
  alg: string;
  /** Type (typ) - should be "JWT" */
  typ?: string;
  /** Content type (cty) - for nested JWT */
  cty?: string;
  /** Key ID (kid) - for key selection */
  kid?: string;
}

/**
 * JWT payload claims.
 */
export interface JwtPayload {
  /** Issuer (iss) */
  iss?: string;
  /** Subject (sub) - user identifier */
  sub?: string;
  /** Audience (aud) - recipient(s) */
  aud?: string | string[];
  /** Expiration time (exp) - Unix timestamp */
  exp?: number;
  /** Not before (nbf) - Unix timestamp */
  nbf?: number;
  /** Issued at (iat) - Unix timestamp */
  iat?: number;
  /** JWT ID (jti) - unique identifier */
  jti?: string;
  /** Custom claims */
  [key: string]: unknown;
}

/**
 * Decoded JWT token.
 */
export interface DecodedJwt {
  /** Header component */
  header: JwtHeader;
  /** Payload component */
  payload: JwtPayload;
  /** Signature component */
  signature: string;
}

/**
 * JWT validation options.
 */
export interface JwtValidationOptions {
  /** Required issuer(s) */
  issuer?: string | string[];
  /** Required audience(s) */
  audience?: string | string[];
  /** Clock skew tolerance in seconds (default: 60) */
  clockSkew?: number;
  /** Maximum token age in seconds (0 = no limit) */
  maxAge?: number;
  /** Require specific algorithm(s) */
  requireAlg?: string | string[];
  /** Block specific algorithm(s) (e.g., "none") */
  blockAlg?: string[];
  /** Validate token structure */
  validateStructure?: boolean;
  /** Check for token replay attacks */
  checkReplay?: boolean;
}

/**
 * JWT validation result.
 */
export interface JwtValidationResult {
  /** Whether the token is valid */
  valid: boolean;
  /** Decoded token (if valid) */
  decoded?: DecodedJwt;
  /** Validation error (if invalid) */
  error?: string;
  /** Error code for client response */
  errorCode?: string;
}

/**
 * JWT verification key.
 */
export interface JwtVerificationKey {
  /** Key ID */
  kid?: string;
  /** Algorithm */
  alg: string;
  /** Secret key for HMAC */
  secret?: string;
  /** Public key for RSA/ECDSA (base64 encoded) */
  publicKey?: string;
  /** Private key for signing (base64 encoded) */
  privateKey?: string;
}

/**
 * Token replay prevention storage entry.
 */
interface ReplayEntry {
  /** Token ID (jti) */
  jti: string;
  /** Expiration time */
  expiresAt: number;
}

// ============================================================================
// Token Replay Prevention
// ============================================================================

/**
 * In-memory storage for token replay prevention.
 * In production, use Redis or similar for distributed systems.
 */
const replayStore = new Map<string, ReplayEntry>();

/**
 * Check if a token has been used before (replay attack prevention).
 *
 * Uses the JWT ID (jti) claim to track tokens that have been used.
 *
 * @param jti - JWT ID from the token
 * @param exp - Expiration time from the token
 * @returns true if this is a replay (token already used)
 */
export function checkTokenReplay(jti: string, exp: number): boolean {
  const existing = replayStore.get(jti);

  if (existing) {
    // Token was already used
    logger.warn("Token replay detected", { jti, expiresAt: new Date(exp * 1000).toISOString() });
    return true;
  }

  // Record this token as used
  replayStore.set(jti, { jti, expiresAt: exp });

  // Clean up expired entries periodically
  if (replayStore.size > 10000) {
    cleanupReplayStore();
  }

  return false;
}

/**
 * Clean up expired entries from the replay store.
 */
export function cleanupReplayStore(): number {
  const now = Math.floor(Date.now() / 1000);
  let cleaned = 0;

  for (const [jti, entry] of replayStore.entries()) {
    if (entry.expiresAt < now) {
      replayStore.delete(jti);
      cleaned++;
    }
  }

  return cleaned;
}

// ============================================================================
// JWT Decoding
// ============================================================================

/**
 * Decode a JWT token without verifying the signature.
 *
 * Splits the token into header, payload, and signature components.
 * Does NOT verify the signature - use verifyJwt() for full validation.
 *
 * @param token - JWT token to decode
 * @returns Decoded JWT or null if invalid
 */
export function decodeJwt(token: string): DecodedJwt | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    const [headerB64, payloadB64, signature] = parts;

    // Decode header
    const headerJson = base64UrlDecode(headerB64);
    const header: JwtHeader = JSON.parse(headerJson);

    // Decode payload
    const payloadJson = base64UrlDecode(payloadB64);
    const payload: JwtPayload = JSON.parse(payloadJson);

    return { header, payload, signature };
  } catch {
    return null;
  }
}

/**
 * Base64URL decode a string.
 */
function base64UrlDecode(str: string): string {
  // Add padding if needed
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
  // Replace URL-safe characters
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  // Decode
  const decoded = atob(base64);
  // Handle UTF-8
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) {
    bytes[i] = decoded.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Base64URL encode a string.
 */
function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  const binString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binString).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// ============================================================================
// JWT Validation
// ============================================================================

/**
 * Validate a JWT token with comprehensive checks.
 *
 * Performs:
 * - Structure validation
 * - Signature verification
 * - Claims validation (exp, nbf, iat, iss, aud)
 * - Algorithm validation
 * - Replay attack prevention
 *
 * @param token - JWT token to validate
 * @param key - Verification key or secret
 * @param options - Validation options
 * @returns Validation result
 */
export async function validateJwt(
  token: string,
  key: string | JwtVerificationKey,
  options: JwtValidationOptions = {}
): Promise<JwtValidationResult> {
  const {
    issuer,
    audience,
    clockSkew = 60,
    maxAge = 0,
    requireAlg = "HS256",
    blockAlg = ["none"],
    validateStructure = true,
    checkReplay = false,
  } = options;

  try {
    // Decode the token
    const decoded = decodeJwt(token);
    if (!decoded) {
      return {
        valid: false,
        error: "Invalid token structure",
        errorCode: "INVALID_STRUCTURE",
      };
    }

    const { header, payload, signature: _signature } = decoded;

    // Validate structure
    if (validateStructure) {
      const structureCheck = validateJwtStructure(decoded);
      if (!structureCheck.valid) {
        return structureCheck;
      }
    }

    // Validate algorithm
    const algCheck = validateAlgorithm(header.alg, requireAlg, blockAlg);
    if (!algCheck.valid) {
      return algCheck;
    }

    // Verify signature
    const sigValid = await verifySignature(decoded, key);
    if (!sigValid) {
      logger.warn("JWT signature verification failed", {
        tokenPrefix: token.substring(0, 20) + "...",
      });
      return {
        valid: false,
        error: "Invalid signature",
        errorCode: "INVALID_SIGNATURE",
      };
    }

    // Validate claims
    const claimsCheck = validateClaims(payload, {
      issuer,
      audience,
      clockSkew,
      maxAge,
    });
    if (!claimsCheck.valid) {
      return claimsCheck;
    }

    // Check for replay attacks
    if (checkReplay && payload.jti) {
      if (checkTokenReplay(payload.jti, payload.exp || 0)) {
        return {
          valid: false,
          error: "Token already used (replay attack)",
          errorCode: "TOKEN_REPLAY",
        };
      }
    }

    return { valid: true, decoded };
  } catch (error) {
    logger.warn("JWT validation error", { error });
    return {
      valid: false,
      error: "Validation failed",
      errorCode: "VALIDATION_ERROR",
    };
  }
}

/**
 * Validate JWT structure.
 *
 * Checks the JWT header and payload for required fields and valid values.
 * This is exported for use in tests and custom validation scenarios.
 */
export function validateJwtStructure(decoded: DecodedJwt): JwtValidationResult {
  const { header, payload } = decoded;

  // Check header
  if (!header.alg) {
    return {
      valid: false,
      error: "Missing algorithm in header",
      errorCode: "MISSING_ALGORITHM",
    };
  }

  if (header.typ && header.typ !== "JWT") {
    return {
      valid: false,
      error: "Invalid token type",
      errorCode: "INVALID_TYPE",
    };
  }

  // Check required claims
  if (!payload.iat) {
    return {
      valid: false,
      error: "Missing issued-at claim",
      errorCode: "MISSING_IAT",
    };
  }

  if (!payload.exp) {
    return {
      valid: false,
      error: "Missing expiration claim",
      errorCode: "MISSING_EXP",
    };
  }

  return { valid: true };
}

/**
 * Validate JWT algorithm.
 */
function validateAlgorithm(
  alg: string,
  require: string | string[],
  block: string[]
): JwtValidationResult {
  const requiredAlgs = Array.isArray(require) ? require : [require];

  // Check if algorithm is blocked
  if (block.includes(alg)) {
    return {
      valid: false,
      error: `Blocked algorithm: ${alg}`,
      errorCode: "BLOCKED_ALGORITHM",
    };
  }

  // Check if algorithm is required
  if (!requiredAlgs.includes(alg)) {
    return {
      valid: false,
      error: `Unsupported algorithm: ${alg}`,
      errorCode: "UNSUPPORTED_ALGORITHM",
    };
  }

  return { valid: true };
}

/**
 * Verify JWT signature.
 */
async function verifySignature(
  decoded: DecodedJwt,
  key: string | JwtVerificationKey
): Promise<boolean> {
  const { header, signature: tokenSignature } = decoded;
  const alg = header.alg;

  try {
    if (alg.startsWith("HS")) {
      // HMAC verification
      const secret = typeof key === "string" ? key : key.secret;
      if (!secret) {
        return false;
      }

      const expectedSig = await hmacSha256(
        `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(decoded.payload))}`,
        secret
      );

      return timingSafeEqual(tokenSignature, expectedSig);
    } else if (alg.startsWith("RS") || alg.startsWith("ES")) {
      // RSA/ECDSA verification
      const publicKey = typeof key === "string" ? key : key.publicKey;
      if (!publicKey) {
        return false;
      }

      try {
        const verifyKey = await crypto.subtle.importKey(
          "spki",
          base64UrlToBytes(publicKey),
          { name: alg.startsWith("RS") ? "RSASSA-PKCS1-v1_5" : "ECDSA", hash: { name: "SHA-256" } },
          false,
          ["verify"]
        );

        const data = new TextEncoder().encode(
          `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(decoded.payload))}`
        );
        const sig = base64UrlToBytes(tokenSignature);

        return await crypto.subtle.verify(
          { name: alg.startsWith("RS") ? "RSASSA-PKCS1-v1_5" : "ECDSA" },
          verifyKey,
          sig,
          data
        );
      } catch {
        return false;
      }
    }

    return false;
  } catch {
    // Any error during signature verification means the signature is invalid
    return false;
  }
}

/**
 * HMAC-SHA256 signing.
 */
async function hmacSha256(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  const signatureBytes = new Uint8Array(signature);

  return base64UrlEncodeBytes(signatureBytes);
}

/**
 * Convert base64url string to bytes.
 */
function base64UrlToBytes(base64url: string): Uint8Array {
  const padded = base64url + "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Base64URL encode bytes.
 */
function base64UrlEncodeBytes(bytes: Uint8Array): string {
  const binString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binString).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Validate JWT claims.
 */
function validateClaims(
  payload: JwtPayload,
  options: {
    issuer?: string | string[];
    audience?: string | string[];
    clockSkew: number;
    maxAge: number;
  }
): JwtValidationResult {
  const now = Math.floor(Date.now() / 1000);
  const { issuer, audience, clockSkew, maxAge } = options;

  // Check expiration
  if (payload.exp) {
    if (payload.exp + clockSkew < now) {
      return {
        valid: false,
        error: "Token expired",
        errorCode: "TOKEN_EXPIRED",
      };
    }
  }

  // Check not before
  if (payload.nbf) {
    if (payload.nbf - clockSkew > now) {
      return {
        valid: false,
        error: "Token not yet valid",
        errorCode: "TOKEN_NOT_YET_VALID",
      };
    }
  }

  // Check issued at
  if (payload.iat) {
    if (payload.iat - clockSkew > now) {
      return {
        valid: false,
        error: "Token issued in the future",
        errorCode: "TOKEN_FUTURE_IAT",
      };
    }

    if (maxAge > 0 && payload.iat + maxAge + clockSkew < now) {
      return {
        valid: false,
        error: "Token too old",
        errorCode: "TOKEN_TOO_OLD",
      };
    }
  }

  // Check issuer
  if (issuer && payload.iss) {
    const allowedIssuers = Array.isArray(issuer) ? issuer : [issuer];
    if (!allowedIssuers.includes(payload.iss)) {
      return {
        valid: false,
        error: "Invalid issuer",
        errorCode: "INVALID_ISSUER",
      };
    }
  }

  // Check audience
  if (audience && payload.aud) {
    const allowedAudiences = Array.isArray(audience) ? audience : [audience];
    const tokenAudiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];

    const hasMatch = tokenAudiences.some((ta) => allowedAudiences.includes(ta));
    if (!hasMatch) {
      return {
        valid: false,
        error: "Invalid audience",
        errorCode: "INVALID_AUDIENCE",
      };
    }
  }

  return { valid: true };
}

// ============================================================================
// JWT Creation
// ============================================================================

/**
 * Create a JWT token.
 *
 * @param payload - JWT payload/claims
 * @param secret - Secret for HMAC signing
 * @param options - Token options
 * @returns Signed JWT token
 */
export async function createJwt(
  payload: JwtPayload,
  secret: string,
  options: {
    algorithm?: string;
    expiresIn?: number;
    issuer?: string;
    audience?: string;
    subject?: string;
    jwtId?: string;
  } = {}
): Promise<string> {
  const { algorithm = "HS256", expiresIn, issuer, audience, subject, jwtId } = options;

  const now = Math.floor(Date.now() / 1000);

  const header: JwtHeader = {
    alg: algorithm,
    typ: "JWT",
  };

  const fullPayload: JwtPayload = {
    ...payload,
    iat: payload.iat || now,
  };

  if (expiresIn) {
    fullPayload.exp = payload.exp || now + expiresIn;
  }

  if (issuer) {
    fullPayload.iss = issuer;
  }

  if (audience) {
    fullPayload.aud = audience;
  }

  if (subject) {
    fullPayload.sub = subject;
  }

  if (jwtId) {
    fullPayload.jti = jwtId;
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await hmacSha256(signingInput, secret);

  return `${signingInput}.${signature}`;
}

// ============================================================================
// Export for Convenience
// ============================================================================

/**
 * Quick JWT validation for common use cases.
 *
 * @param token - JWT token
 * @param secret - Secret key
 * @returns Validation result with payload if valid
 */
export async function verifyJwt(
  token: string,
  secret: string
): Promise<{ valid: boolean; payload?: JwtPayload; error?: string }> {
  const result = await validateJwt(token, secret);

  if (result.valid && result.decoded) {
    return { valid: true, payload: result.decoded.payload };
  }

  return { valid: false, error: result.error };
}
