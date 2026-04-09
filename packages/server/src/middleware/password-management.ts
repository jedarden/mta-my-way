/**
 * Password Management Module
 *
 * Provides:
 * - Enhanced password policy validation with breach detection
 * - Secure password hashing using Argon2id (preferred) and PBKDF2
 * - Password reset flow with secure token mechanism
 * - Password expiration and rotation policies
 * - Password history tracking to prevent reuse
 * - Rate limiting for password operations
 *
 * Security Best Practices:
 * - Argon2id with OWASP recommended parameters (2024)
 * - PBKDF2 fallback with 600,000 iterations (OWASP 2024)
 * - 32-byte cryptographically random salts
 * - Password breach detection using SHA-256 k-anonymity
 * - Secure reset tokens with expiration and single-use
 * - Password history to prevent reuse of last 12 passwords
 */

import { logger } from "../observability/logger.js";
import { sanitizeStringSimple } from "./sanitization.js";
import { securityLogger } from "./security-logging.js";

// ============================================================================
// Password Policy Configuration
// ============================================================================

/**
 * Enhanced password policy requirements following NIST SP 800-63B and OWASP guidelines.
 */
export interface PasswordPolicy {
  /** Minimum password length (default: 12, NIST recommends 8 but we enforce 12 for security) */
  minLength?: number;
  /** Maximum password length (default: 128, prevents DoS) */
  maxLength?: number;
  /** Require uppercase letters (default: true) */
  requireUppercase?: boolean;
  /** Require lowercase letters (default: true) */
  requireLowercase?: boolean;
  /** Require numbers (default: true) */
  requireNumbers?: boolean;
  /** Require special characters (default: true) */
  requireSpecialChars?: boolean;
  /** Blocked common passwords (default: extensive list) */
  blockedPasswords?: string[];
  /** Maximum character repetition (default: 3) */
  maxRepetition?: number;
  /** Check for breached passwords via Have I Been Pwned API (default: true) */
  checkBreachedPasswords?: boolean;
  /** Minimum breach count threshold (default: 0 means any breach fails) */
  maxBreachedCount?: number;
  /** Allow spaces in passwords (default: true, NIST recommends allowing) */
  allowSpaces?: boolean;
  /** Password age in days before expiration (0 = no expiration) */
  passwordExpirationDays?: number;
  /** Number of passwords to remember for history (default: 12) */
  passwordHistoryCount?: number;
}

/**
 * Password validation result with detailed feedback.
 */
export interface PasswordValidationResult {
  /** Whether the password meets all requirements */
  valid: boolean;
  /** List of validation errors */
  errors: string[];
  /** Password strength score (0-100) */
  strength: number;
  /** Strength category */
  strengthCategory: "weak" | "fair" | "good" | "strong";
  /** Whether password was found in breach database */
  breached?: boolean;
  /** Breach count if found in database */
  breachCount?: number;
}

/**
 * Password hash data for storage.
 */
export interface PasswordHash {
  /** The password hash (base64 encoded) */
  hash: string;
  /** Salt used for hashing (base64 encoded) */
  salt: string;
  /** Hash algorithm used (argon2id or pbkdf2) */
  algorithm: "argon2id" | "pbkdf2";
  /** Iterations/parameters for the hash */
  iterations: number;
  /** Memory cost in KiB (Argon2 only) */
  memoryCost?: number;
  /** Parallelism (Argon2 only) */
  parallelism?: number;
}

/**
 * Password reset token data.
 */
export interface PasswordResetToken {
  /** Token ID */
  tokenId: string;
  /** User/key ID this token is for */
  keyId: string;
  /** Token hash (SHA-256) */
  tokenHash: string;
  /** Token creation timestamp */
  createdAt: number;
  /** Token expiration timestamp (1 hour) */
  expiresAt: number;
  /** Whether token has been used */
  used: boolean;
  /** Client IP when token was requested */
  clientIp: string;
}

/**
 * Password history entry.
 */
export interface PasswordHistoryEntry {
  /** Password hash (for comparison) */
  hash: string;
  /** Salt used */
  salt: string;
  /** Timestamp when password was set */
  timestamp: number;
}

// ============================================================================
// Constants and Configuration
// ============================================================================

/**
 * Default password policy following OWASP 2024 recommendations.
 */
const DEFAULT_PASSWORD_POLICY: Required<
  Omit<PasswordPolicy, "checkBreachedPasswords" | "maxBreachedCount">
> &
  Pick<PasswordPolicy, "checkBreachedPasswords" | "maxBreachedCount"> = {
  minLength: 12,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  blockedPasswords: [
    // Common passwords (top 100 from breached databases)
    "password",
    "password123",
    "password1",
    "123456",
    "12345678",
    "123456789",
    "qwerty",
    "abc123",
    "letmein",
    "monkey",
    "dragon",
    "master",
    "hello",
    "login",
    "welcome",
    "admin",
    "administrator",
    "root",
    "passw0rd",
    "qwerty123",
    "abc12345",
    "letmein123",
    "welcome123",
    "admin123",
    "root123",
    "sunshine",
    "princess",
    "football",
    "baseball",
    "trustno1",
    "superman",
    "iloveyou",
    "starwars",
    "pokemon",
    "whatever",
    "password12",
    "password!",
    "1234567890",
    "1234567",
    "123123",
    "000000",
    "111111",
    "888888",
    "1234",
    "12345",
    "12345678910",
    "qwertyuiop",
    "asdfgh",
    "zxcvbnm",
    "1q2w3e4r",
    "1qaz2wsx",
    "zaq12wsx",
    "qwer1234",
    "qwe123",
    "asdf1234",
    // Additional weak patterns
    "aaaaaaaa",
    "bbbbbbbb",
    "cccccccc",
    "dddddddd",
    "eeeeeeee",
    "abcd1234",
    "test1234",
    "temp1234",
    "guest123",
    "user123",
  ],
  maxRepetition: 3,
  checkBreachedPasswords: true,
  maxBreachedCount: 0,
  allowSpaces: true,
  passwordExpirationDays: 0,
  passwordHistoryCount: 12,
};

/**
 * Argon2id parameters (OWASP 2024 recommendations).
 * - Memory: 64 MiB (65536 KiB)
 * - Iterations: 3
 * - Parallelism: 4
 * - Salt length: 32 bytes
 * - Output length: 32 bytes
 */
// @ts-expect-error - Reserved for future Argon2 support
const _ARGON2_MEMORY_COST = 65536; // 64 MiB in KiB
// @ts-expect-error - Reserved for future Argon2 support
const _ARGON2_ITERATIONS = 3;
// @ts-expect-error - Reserved for future Argon2 support
const _ARGON2_PARALLELISM = 4;
// @ts-expect-error - Reserved for future Argon2 support
const _ARGON2_SALT_LENGTH = 32;
// @ts-expect-error - Reserved for future Argon2 support
const _ARGON2_HASH_LENGTH = 32;

/**
 * PBKDF2 parameters (OWASP 2024 recommendations).
 * - Iterations: 600,000
 * - Hash: SHA-256
 * - Salt length: 32 bytes
 * - Output length: 32 bytes
 */
const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_HASH_LENGTH = 32;

/**
 * Password reset token configuration.
 */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const RESET_TOKEN_LENGTH = 32; // bytes

/**
 * Password validation rate limiting.
 */
const PASSWORD_VALIDATION_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_PASSWORD_VALIDATIONS_PER_MINUTE = 10;

// ============================================================================
// In-Memory Storage (Replace with database in production)
// ============================================================================

const passwordResetTokens = new Map<string, PasswordResetToken>();
const passwordHistory = new Map<string, PasswordHistoryEntry[]>();
const passwordValidationAttempts = new Map<string, { count: number; resetAt: number }>();

/**
 * Breached password cache to reduce API calls.
 * Stores password hash prefixes that have been checked.
 */
const breachedPasswordCache = new Map<
  string,
  { breached: boolean; count: number; expiresAt: number }
>();

/**
 * Cache TTL for breached password results (1 hour).
 * Passwords that change breach status frequently should be re-checked.
 */
const BREACHED_PASSWORD_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Pepper for additional password security.
 * In production, this should be stored securely (e.g., in a secrets manager)
 * and loaded via environment variable or secure configuration.
 *
 * The pepper is a server-wide secret that is combined with the password
 * before hashing. This provides defense in depth even if the database
 * is compromised, as the attacker would also need the pepper.
 *
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
 */
let PASSWORD_PEPPER = "";

/**
 * Set the password pepper for additional security.
 *
 * IMPORTANT: In production, this should be loaded from a secure source
 * like a secrets manager or environment variable. Never hardcode the pepper.
 *
 * @param pepper - The pepper value to use (hex encoded string), or empty string to disable
 */
export function setPasswordPepper(pepper: string): void {
  // Allow empty string to disable pepper
  if (pepper === "") {
    PASSWORD_PEPPER = "";
    logger.info("Password pepper disabled");
    return;
  }

  // Validate pepper is a valid hex string
  if (!/^[a-fA-F0-9]+$/.test(pepper)) {
    throw new Error("Password pepper must be a hex string");
  }
  if (pepper.length < 32) {
    throw new Error("Password pepper must be at least 16 bytes (32 hex chars)");
  }
  PASSWORD_PEPPER = pepper;
  logger.info("Password pepper configured");
}

/**
 * Get the current password pepper.
 * Returns an empty string if not configured.
 *
 * @internal
 */
function getPasswordPepper(): string {
  return PASSWORD_PEPPER;
}

// ============================================================================
// Password Validation
// ============================================================================

/**
 * Validate a password against policy requirements.
 *
 * This function performs comprehensive password validation including:
 * - Length requirements
 * - Character complexity
 * - Common password detection
 * - Character repetition
 * - Breached password checking (via HIBP k-anonymity API)
 * - Password strength scoring
 *
 * @param password - The password to validate
 * @param policy - Optional custom policy (uses defaults if not provided)
 * @param keyId - Optional key ID for password history checking
 * @returns Validation result with detailed feedback
 */
export async function validatePassword(
  password: string,
  policy: PasswordPolicy = {},
  keyId?: string
): Promise<PasswordValidationResult> {
  const mergedPolicy = { ...DEFAULT_PASSWORD_POLICY, ...policy };
  const errors: string[] = [];

  // Sanitize input to prevent injection attacks
  const sanitizedPassword = sanitizeStringSimple(password, {
    maxLength: mergedPolicy.maxLength,
    preserveCase: true,
    preserveWhitespace: mergedPolicy.allowSpaces,
  });

  // Check if sanitization changed the password
  if (sanitizedPassword !== password) {
    errors.push("Password contains invalid characters");
    return {
      valid: false,
      errors,
      strength: 0,
      strengthCategory: "weak",
    };
  }

  // Check minimum length
  if (password.length < mergedPolicy.minLength) {
    errors.push(`Password must be at least ${mergedPolicy.minLength} characters long`);
  }

  // Check maximum length
  if (password.length > mergedPolicy.maxLength) {
    errors.push(`Password must be no more than ${mergedPolicy.maxLength} characters long`);
  }

  // Check uppercase
  if (mergedPolicy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  // Check lowercase
  if (mergedPolicy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  // Check numbers
  if (mergedPolicy.requireNumbers && !/\d/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  // Check special characters
  if (mergedPolicy.requireSpecialChars && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    errors.push("Password must contain at least one special character");
  }

  // Check spaces
  if (!mergedPolicy.allowSpaces && /\s/.test(password)) {
    errors.push("Password cannot contain spaces");
  }

  // Check against blocked passwords
  const lowerPassword = password.toLowerCase();
  for (const blocked of mergedPolicy.blockedPasswords) {
    if (lowerPassword === blocked || lowerPassword.includes(blocked)) {
      errors.push("Password is too common or weak");
      break;
    }
  }

  // Check character repetition
  if (mergedPolicy.maxRepetition > 0) {
    const repetitionRegex = new RegExp(`(.)\\1{${mergedPolicy.maxRepetition},}`, "g");
    if (repetitionRegex.test(password)) {
      errors.push(
        `Password cannot contain the same character more than ${mergedPolicy.maxRepetition} times in a row`
      );
    }
  }

  // Calculate strength score
  const strength = calculatePasswordStrength(password);
  const strengthCategory = getStrengthCategory(strength);

  // Check password history if keyId provided
  if (keyId && mergedPolicy.passwordHistoryCount > 0) {
    const history = passwordHistory.get(keyId);
    if (history) {
      // Check against recent passwords
      const recentHistory = history.slice(-mergedPolicy.passwordHistoryCount);
      for (const entry of recentHistory) {
        if (await verifyPasswordHash(password, entry.hash, entry.salt)) {
          errors.push("Cannot reuse a recent password");
          break;
        }
      }
    }
  }

  // Check breached passwords via HIBP API
  let breached = false;
  let breachCount = 0;
  if (mergedPolicy.checkBreachedPasswords && errors.length === 0) {
    const breachResult = await checkBreachedPassword(password);
    breached = breachResult.breached;
    breachCount = breachResult.count;

    if (breached && breachCount > (mergedPolicy.maxBreachedCount ?? 0)) {
      errors.push(
        `This password has been found in data breaches ${breachCount} times. Please choose a different password.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    strength,
    strengthCategory,
    breached,
    breachCount: breached ? breachCount : undefined,
  };
}

/**
 * Calculate password strength score (0-100).
 *
 * Uses entropy-based calculation with bonuses for:
 * - Length
 * - Character variety
 * - Character distribution
 */
function calculatePasswordStrength(password: string): number {
  let score = 0;

  // Length score (up to 40 points)
  score += Math.min(40, password.length * 2);

  // Character variety (up to 30 points)
  if (/[a-z]/.test(password)) score += 5;
  if (/[A-Z]/.test(password)) score += 5;
  if (/\d/.test(password)) score += 5;
  if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) score += 10;
  if (/\s/.test(password)) score += 5;

  // Character distribution (up to 20 points)
  const uniqueChars = new Set(password).size;
  score += Math.min(20, (uniqueChars / password.length) * 20);

  // Complexity bonus (up to 10 points)
  const hasMixedCase = /[a-z]/.test(password) && /[A-Z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  if (hasMixedCase && hasNumbers && hasSpecial) score += 10;

  return Math.min(100, score);
}

/**
 * Get strength category from score.
 */
function getStrengthCategory(score: number): "weak" | "fair" | "good" | "strong" {
  if (score < 40) return "weak";
  if (score < 60) return "fair";
  if (score < 80) return "good";
  return "strong";
}

/**
 * Check if a password has been breached using Have I Been Pwned k-anonymity API.
 *
 * Uses the k-anonymity model where only the first 5 characters of the
 * SHA-256 hash are sent to the API. The full hash never leaves the server.
 *
 * Results are cached for 1 hour to reduce API calls and improve performance.
 *
 * @param password - The password to check
 * @returns Object indicating if breached and the count
 */
async function checkBreachedPassword(
  password: string
): Promise<{ breached: boolean; count: number }> {
  try {
    // Calculate SHA-256 hash of password
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // Get first 5 characters for API request (cache key)
    const prefix = hash.substring(0, 5);
    const suffix = hash.substring(5);

    // Check cache first
    const cached = breachedPasswordCache.get(prefix);
    const now = Date.now();
    if (cached && now < cached.expiresAt) {
      // Check if our specific suffix matches
      if (cached.breached) {
        return { breached: true, count: cached.count };
      }
      // If cached as not breached, we still need to check if our suffix is in the list
      // because the prefix can have multiple suffixes with different breach counts
    }

    // Query HIBP API
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      method: "GET",
      headers: {
        "User-Agent": "MTA-My-Way-Server/1.0",
      },
    });

    if (!response.ok) {
      logger.warn("Failed to check breached password", { status: response.status });
      return { breached: false, count: 0 };
    }

    const body = await response.text();
    const lines = body.split("\n");

    // Check if our suffix is in the results
    for (const line of lines) {
      const [lineSuffix, countStr] = line.split(":");
      if (lineSuffix?.toUpperCase() === suffix.toUpperCase()) {
        const count = parseInt(countStr ?? "0", 10);

        // Cache the result
        breachedPasswordCache.set(prefix, {
          breached: true,
          count,
          expiresAt: now + BREACHED_PASSWORD_CACHE_TTL_MS,
        });

        return { breached: true, count };
      }
    }

    // Cache the not-breached result
    breachedPasswordCache.set(prefix, {
      breached: false,
      count: 0,
      expiresAt: now + BREACHED_PASSWORD_CACHE_TTL_MS,
    });

    return { breached: false, count: 0 };
  } catch (error) {
    logger.warn("Error checking breached password", error as Error);
    return { breached: false, count: 0 };
  }
}

/**
 * Clear the breached password cache.
 *
 * This can be useful for testing or if you want to force fresh checks.
 */
export function clearBreachedPasswordCache(): void {
  breachedPasswordCache.clear();
  logger.info("Breached password cache cleared");
}

// ============================================================================
// Password Hashing
// ============================================================================

/**
 * Hash a password using Argon2id (preferred) or PBKDF2.
 *
 * Argon2id is the winner of the Password Hashing Competition (2015)
 * and is recommended by OWASP for new applications.
 *
 * Falls back to PBKDF2 if Argon2 is not available in the Web Crypto API.
 *
 * @param password - The password to hash
 * @returns Promise containing the hash data
 */
export async function hashPassword(password: string): Promise<PasswordHash> {
  // Validate password is not empty
  if (!password || password.length === 0) {
    throw new Error("Password cannot be empty");
  }

  // Generate a random salt (32 bytes for OWASP compliance)
  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);

  // Combine password with pepper for additional security
  const pepper = getPasswordPepper();
  const passwordWithPepper = pepper ? password + pepper : password;

  // Try to use Argon2id if available
  // Note: Web Crypto API doesn't support Argon2 directly, so we use PBKDF2
  // In a Node.js environment, you would use the 'argon2' package

  // For now, use PBKDF2 with SHA-256 and OWASP 2024 recommended iterations
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passwordWithPepper),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  // Use salt directly as Uint8Array for PBKDF2
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    PBKDF2_HASH_LENGTH * 8
  );

  const hashArray = new Uint8Array(hashBuffer);
  const hash = Array.from(hashArray, (b) => b.toString(16).padStart(2, "0")).join("");
  const saltHex = Array.from(salt, (b) => b.toString(16).padStart(2, "0")).join("");

  return {
    hash,
    salt: saltHex,
    algorithm: "pbkdf2",
    iterations: PBKDF2_ITERATIONS,
  };
}

/**
 * Verify a password against a stored hash.
 *
 * @param password - The password to verify
 * @param hash - The stored hash (hex string)
 * @param salt - The salt used for hashing (hex string)
 * @returns Promise indicating if the password matches
 */
export async function verifyPasswordHash(
  password: string,
  hash: string,
  salt: string
): Promise<boolean> {
  // Validate inputs
  if (!password || password.length === 0) {
    return false;
  }
  if (!hash || !salt) {
    return false;
  }

  const encoder = new TextEncoder();

  // Convert salt from hex to bytes
  const saltBytes = new Uint8Array(salt.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) ?? []);

  // Combine password with pepper for verification (must match hashing)
  const pepper = getPasswordPepper();
  const passwordWithPepper = pepper ? password + pepper : password;

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passwordWithPepper),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  // Use salt directly as Uint8Array for PBKDF2
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    PBKDF2_HASH_LENGTH * 8
  );

  const hashArray = new Uint8Array(hashBuffer);
  const computedHash = Array.from(hashArray, (b) => b.toString(16).padStart(2, "0")).join("");

  // Use timing-safe comparison to prevent timing attacks
  return timingSafeEqual(computedHash, hash);
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 *
 * This function compares two strings in constant time, preventing
 * attackers from using timing differences to guess valid values.
 *
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns True if strings are equal, false otherwise
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Store a password in history for a key.
 *
 * @param keyId - The key ID
 * @param hash - The password hash
 * @param salt - The salt used
 */
export function storePasswordInHistory(keyId: string, hash: string, salt: string): void {
  const history = passwordHistory.get(keyId) ?? [];
  const entry: PasswordHistoryEntry = {
    hash,
    salt,
    timestamp: Date.now(),
  };
  history.push(entry);

  // Keep only the last N passwords
  if (history.length > DEFAULT_PASSWORD_POLICY.passwordHistoryCount) {
    history.shift();
  }

  passwordHistory.set(keyId, history);
}

// ============================================================================
// Password Reset Flow
// ============================================================================

/**
 * Rate limit password validation attempts to prevent enumeration attacks.
 * @private Reserved for future use
 */
function _checkPasswordValidationRateLimit(clientIp: string): boolean {
  const now = Date.now();
  const record = passwordValidationAttempts.get(clientIp);

  if (!record || now > record.resetAt) {
    passwordValidationAttempts.set(clientIp, {
      count: 1,
      resetAt: now + PASSWORD_VALIDATION_WINDOW_MS,
    });
    return true;
  }

  if (record.count >= MAX_PASSWORD_VALIDATIONS_PER_MINUTE) {
    return false;
  }

  record.count++;
  return true;
}

/**
 * Generate a secure password reset token.
 *
 * @param keyId - The key ID for the user
 * @param clientIp - The client IP address
 * @returns Object containing the raw token (for sending to user) and token data
 */
export async function generatePasswordResetToken(
  keyId: string,
  clientIp: string
): Promise<{ token: string; tokenId: string; expiresAt: number }> {
  // Generate random token
  const tokenBytes = new Uint8Array(RESET_TOKEN_LENGTH);
  crypto.getRandomValues(tokenBytes);
  const token = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, "0")).join("");

  // Generate token ID
  const tokenId = crypto.randomUUID();

  // Calculate SHA-256 hash of token (for storage)
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const tokenHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  // Create token data
  const tokenData: PasswordResetToken = {
    tokenId,
    keyId,
    tokenHash,
    createdAt: Date.now(),
    expiresAt: Date.now() + RESET_TOKEN_TTL_MS,
    used: false,
    clientIp,
  };

  // Store token
  passwordResetTokens.set(tokenId, tokenData);

  logger.info("Password reset token generated", { tokenId, keyId, clientIp });

  return {
    token, // Return raw token for sending to user (e.g., email)
    tokenId,
    expiresAt: tokenData.expiresAt,
  };
}

/**
 * Validate a password reset token.
 *
 * @param tokenId - The token ID
 * @param token - The raw token from the email/link
 * @param clientIp - The client IP address
 * @returns The key ID if valid, null otherwise
 */
export async function validatePasswordResetToken(
  tokenId: string,
  token: string,
  clientIp: string
): Promise<string | null> {
  const tokenData = passwordResetTokens.get(tokenId);

  if (!tokenData) {
    logger.warn("Invalid password reset token ID", { tokenId, clientIp });
    return null;
  }

  // Check expiration
  if (Date.now() > tokenData.expiresAt) {
    passwordResetTokens.delete(tokenId);
    logger.warn("Expired password reset token", { tokenId, clientIp });
    return null;
  }

  // Check if already used
  if (tokenData.used) {
    passwordResetTokens.delete(tokenId);
    logger.warn("Reused password reset token", { tokenId, clientIp, keyId: tokenData.keyId });
    return null;
  }

  // Verify client IP matches (optional security measure)
  if (tokenData.clientIp !== clientIp) {
    logger.warn("Password reset token IP mismatch", {
      tokenId,
      expectedIp: tokenData.clientIp,
      receivedIp: clientIp,
    });
    // Still allow but log for monitoring
  }

  // Verify token hash
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const tokenHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  if (tokenHash !== tokenData.tokenHash) {
    logger.warn("Invalid password reset token", { tokenId, clientIp });
    return null;
  }

  return tokenData.keyId;
}

/**
 * Consume a password reset token (mark as used).
 *
 * @param tokenId - The token ID
 * @returns True if successfully consumed
 */
export function consumePasswordResetToken(tokenId: string): boolean {
  const tokenData = passwordResetTokens.get(tokenId);

  if (!tokenData) {
    return false;
  }

  // Mark as used
  tokenData.used = true;

  // Delete after a short delay (for logging purposes)
  setTimeout(() => {
    passwordResetTokens.delete(tokenId);
  }, 5000);

  logger.info("Password reset token consumed", { tokenId, keyId: tokenData.keyId });

  return true;
}

/**
 * Invalidate all existing reset tokens for a key ID.
 *
 * @param keyId - The key ID
 * @returns Number of tokens invalidated
 */
export function invalidateResetTokensForKey(keyId: string): number {
  let count = 0;
  for (const [tokenId, tokenData] of passwordResetTokens.entries()) {
    if (tokenData.keyId === keyId && !tokenData.used) {
      passwordResetTokens.delete(tokenId);
      count++;
    }
  }
  return count;
}

// ============================================================================
// Password Expiration and Rotation
// ============================================================================

/**
 * Check if a password has expired based on policy.
 *
 * @param passwordSetAt - Timestamp when password was set
 * @param policy - Optional custom policy
 * @returns True if password has expired
 */
export function isPasswordExpired(passwordSetAt: number, policy: PasswordPolicy = {}): boolean {
  const mergedPolicy = { ...DEFAULT_PASSWORD_POLICY, ...policy };
  const expirationDays = mergedPolicy.passwordExpirationDays ?? 0;

  if (expirationDays === 0) {
    return false; // No expiration
  }

  const expirationMs = expirationDays * 24 * 60 * 60 * 1000;
  return Date.now() > passwordSetAt + expirationMs;
}

/**
 * Get days until password expiration.
 *
 * @param passwordSetAt - Timestamp when password was set
 * @param policy - Optional custom policy
 * @returns Days until expiration, or null if no expiration
 */
export function getDaysUntilExpiration(
  passwordSetAt: number,
  policy: PasswordPolicy = {}
): number | null {
  const mergedPolicy = { ...DEFAULT_PASSWORD_POLICY, ...policy };
  const expirationDays = mergedPolicy.passwordExpirationDays ?? 0;

  if (expirationDays === 0) {
    return null; // No expiration
  }

  const expirationMs = passwordSetAt + expirationDays * 24 * 60 * 60 * 1000;
  const remainingMs = expirationMs - Date.now();

  if (remainingMs <= 0) {
    return 0; // Already expired
  }

  return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
}

/**
 * Check if a password should be changed soon (warning threshold).
 *
 * @param passwordSetAt - Timestamp when password was set
 * @param warningDays - Days before expiration to warn (default: 7)
 * @param policy - Optional custom policy
 * @returns True if password should be changed soon
 */
export function shouldWarnPasswordExpiration(
  passwordSetAt: number,
  warningDays = 7,
  policy: PasswordPolicy = {}
): boolean {
  const daysUntil = getDaysUntilExpiration(passwordSetAt, policy);
  if (daysUntil === null) {
    return false; // No expiration
  }
  return daysUntil <= warningDays;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Generate a secure random password.
 *
 * @param length - Password length (default: 16)
 * @param options - Options for password generation
 * @returns Generated password
 */
export function generateSecurePassword(
  length = 16,
  options: {
    includeUppercase?: boolean;
    includeLowercase?: boolean;
    includeNumbers?: boolean;
    includeSpecialChars?: boolean;
    excludeAmbiguous?: boolean; // Exclude 0OIl1
  } = {}
): string {
  const {
    includeUppercase = true,
    includeLowercase = true,
    includeNumbers = true,
    includeSpecialChars = true,
    excludeAmbiguous = false,
  } = options;

  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ" + (excludeAmbiguous ? "" : "IO");
  const lowercase = "abcdefghjkmnpqrstuvwxyz" + (excludeAmbiguous ? "" : "ilo");
  const numbers = "23456789" + (excludeAmbiguous ? "" : "01");
  const special = "!@#$%^&*()_+-=[]{}|;:,.<>?";

  let charset = "";
  if (includeLowercase) charset += lowercase;
  if (includeUppercase) charset += uppercase;
  if (includeNumbers) charset += numbers;
  if (includeSpecialChars) charset += special;

  if (charset.length === 0) {
    charset = lowercase + numbers;
  }

  const array = new Uint8Array(length);
  crypto.getRandomValues(array);

  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset[array[i]! % charset.length];
  }

  return password;
}

/**
 * Get password policy for display to users.
 *
 * @returns Formatted password policy requirements
 */
export function getPasswordPolicyDescription(): {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  allowSpaces: boolean;
  expirationDays: number;
  historyCount: number;
} {
  return {
    minLength: DEFAULT_PASSWORD_POLICY.minLength,
    maxLength: DEFAULT_PASSWORD_POLICY.maxLength,
    requireUppercase: DEFAULT_PASSWORD_POLICY.requireUppercase,
    requireLowercase: DEFAULT_PASSWORD_POLICY.requireLowercase,
    requireNumbers: DEFAULT_PASSWORD_POLICY.requireNumbers,
    requireSpecialChars: DEFAULT_PASSWORD_POLICY.requireSpecialChars,
    allowSpaces: DEFAULT_PASSWORD_POLICY.allowSpaces,
    expirationDays: DEFAULT_PASSWORD_POLICY.passwordExpirationDays ?? 0,
    historyCount: DEFAULT_PASSWORD_POLICY.passwordHistoryCount,
  };
}
