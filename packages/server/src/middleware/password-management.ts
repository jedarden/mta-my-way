/**
 * Password Management Module
 *
 * Provides:
 * - Enhanced password policy validation with breach detection
 * - Secure password hashing using Argon2id (industry-standard)
 * - Password reset flow with secure token mechanism
 * - Password expiration and rotation policies
 * - Password history tracking to prevent reuse
 * - Rate limiting for password operations
 *
 * Security Best Practices:
 * - Argon2id with OWASP recommended parameters (2024)
 * - 32-byte cryptographically random salts
 * - Password breach detection using SHA-256 k-anonymity
 * - Secure reset tokens with expiration and single-use
 * - Password history to prevent reuse of last 12 passwords
 */

import * as argon2 from "argon2";
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
  /** Block sequential characters (default: true) - e.g., "1234", "abcd", "4321" */
  blockSequentialChars?: boolean;
  /** Maximum sequential characters allowed (default: 3) */
  maxSequentialChars?: number;
  /** Block keyboard walking patterns (default: true) - e.g., "qwerty", "asdf" */
  blockKeyboardPatterns?: boolean;
  /** Minimum password strength score (default: 40, range 0-100) */
  minStrengthScore?: number;
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
  blockSequentialChars: true,
  maxSequentialChars: 3,
  blockKeyboardPatterns: true,
  minStrengthScore: 40,
};

/**
 * Common keyboard patterns to detect and block.
 * Includes both forward and reverse sequences.
 */
const KEYBOARD_PATTERNS = [
  // QWERTY row
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
  // QWERTY row (reversed)
  "poiuytrewq",
  "lkjhgfdsa",
  "mnbvcxz",
  // QWERTY column patterns
  "qaz",
  "wsx",
  "edc",
  "rfv",
  "tgb",
  "yhn",
  "ujm",
  "ik",
  "ol",
  "p",
  // QWERTY column patterns (reversed)
  "zaq",
  "xsw",
  "cde",
  "vfr",
  "bgt",
  "nhy",
  "mju",
  "ki",
  "lo",
  // Number row
  "1234567890",
  "0987654321",
  // Common keyboard walking sequences (longer)
  "qwerty",
  "asdfgh",
  "zxcvbn",
  "qwer",
  "asdf",
  "zxcv",
  // Reversed common sequences
  "ytrewq",
  "hgfdsa",
  "nbvcxz",
  // Diagonal patterns
  "1qaz",
  "2wsx",
  "3edc",
  "4rfv",
  "5tgb",
  "6yhn",
  "7ujm",
  "8ik",
  "9ol",
  "0p",
  // Reversed diagonal
  "zaq1",
  "xsw2",
  "cde3",
  "vfr4",
  "bgt5",
  "nhy6",
  "mju7",
  "ki8",
  "lo9",
  "p0",
];

/**
 * Argon2id parameters (OWASP 2024 recommendations).
 * - Memory: 64 MiB (65536 KiB)
 * - Iterations: 3
 * - Parallelism: 4
 * - Salt length: 32 bytes
 * - Output length: 32 bytes
 */
const ARGON2_OPTIONS: argon2.Options = {
  memoryCost: 65536, // 64 MiB in KiB
  timeCost: 3, // Number of iterations
  parallelism: 4, // Number of threads/lanes
  hashLength: 32, // Output hash length in bytes
  type: argon2.argon2id, // Argon2id (recommended for password hashing)
};

/**
 * PBKDF2 parameters (OWASP 2024 recommendations).
 * - Iterations: 600,000
 * - Hash: SHA-256
 * - Salt length: 32 bytes
 * - Output length: 32 bytes
 *
 * NOTE: PBKDF2 is kept for backward compatibility with existing hashes.
 * New passwords should use Argon2id.
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
 * Detect sequential character patterns in password.
 * Checks for:
 * - Numeric sequences: 1234, 4321, 0123
 * - Alphabetic sequences: abcd, DCBA, mnop
 * - Both forward and reverse sequences
 *
 * @param password - The password to check
 * @param maxSequence - Maximum allowed sequential characters
 * @returns Object indicating if sequential pattern was found and the pattern
 */
function detectSequentialChars(
  password: string,
  maxSequence: number
): { found: boolean; pattern?: string } {
  const lowerPassword = password.toLowerCase();

  // Check each position for sequences
  for (let i = 0; i < lowerPassword.length - (maxSequence - 1); i++) {
    // Extract potential sequence
    const sequence = lowerPassword.substring(i, i + maxSequence + 1);

    // Check if it's a valid sequence (all letters or all digits)
    const isAllLetters = /^[a-z]+$/.test(sequence);
    const isAllDigits = /^\d+$/.test(sequence);

    if (!isAllLetters && !isAllDigits) {
      continue;
    }

    // Check for forward or reverse sequential pattern
    if (isSequentialSequence(sequence)) {
      return { found: true, pattern: sequence };
    }
  }

  return { found: false };
}

/**
 * Check if a string is a sequential character pattern.
 * Handles both forward (abcd, 1234) and reverse (dcba, 4321) sequences.
 */
function isSequentialSequence(str: string): boolean {
  if (str.length < 2) return false;

  // Check forward sequence
  let isForward = true;
  let isReverse = true;

  for (let i = 0; i < str.length - 1; i++) {
    const current = str.charCodeAt(i);
    const next = str.charCodeAt(i + 1);

    // Forward: next char is exactly +1
    if (next !== current + 1) {
      isForward = false;
    }

    // Reverse: next char is exactly -1
    if (next !== current - 1) {
      isReverse = false;
    }
  }

  return isForward || isReverse;
}

/**
 * Detect keyboard walking patterns in password.
 * Checks for common keyboard sequences like "qwerty", "asdf", "1qaz", etc.
 *
 * Only reports patterns of 3+ characters to avoid false positives on
 * single characters that happen to be part of keyboard layouts.
 *
 * @param password - The password to check
 * @returns Object indicating if keyboard pattern was found and the pattern
 */
function detectKeyboardPatterns(password: string): { found: boolean; pattern?: string } {
  const lowerPassword = password.toLowerCase();
  const MIN_PATTERN_LENGTH = 3;

  // Check each pattern
  for (const pattern of KEYBOARD_PATTERNS) {
    // Skip patterns shorter than minimum length
    if (pattern.length < MIN_PATTERN_LENGTH) {
      continue;
    }

    // Check if pattern exists in password (case-insensitive)
    if (lowerPassword.includes(pattern)) {
      return { found: true, pattern };
    }

    // Also check reversed version of pattern
    const reversed = pattern.split("").reverse().join("");
    if (lowerPassword.includes(reversed)) {
      return { found: true, pattern: reversed };
    }
  }

  return { found: false };
}

/**
 * Detect common password variations like "password1", "password2", etc.
 *
 * @param password - The password to check
 * @param skipKeyboardBased - Whether to skip keyboard-based common words (when blockKeyboardPatterns is false)
 * @returns Object indicating if common variation was found
 */
function detectCommonVariations(
  password: string,
  skipKeyboardBased = false
): { found: boolean; pattern?: string } {
  const lowerPassword = password.toLowerCase();

  // Common base passwords with number/special char variations
  // Keyboard-based words (qwerty, asdf) are skipped when blockKeyboardPatterns is false
  const commonBases = [
    "password",
    "passw0rd",
    "admin",
    "welcome",
    "login",
    // Skip keyboard-based words when requested
    ...(skipKeyboardBased ? [] : ["qwerty"]),
    "letmein",
    "monkey",
    "dragon",
    "master",
  ];

  for (const base of commonBases) {
    // Check if password starts with common base
    if (!lowerPassword.startsWith(base)) {
      continue;
    }

    const suffix = lowerPassword.slice(base.length);

    // If there's no suffix, it's just the base word (handled elsewhere)
    if (suffix.length === 0) {
      continue;
    }

    // Check if suffix is only numbers
    if (/^\d+$/.test(suffix)) {
      return { found: true, pattern: base + "[numbers]" };
    }

    // Check if suffix is only special characters
    if (/^[!@#$%^&*]+$/.test(suffix)) {
      return { found: true, pattern: base + "[special]" };
    }

    // Check if suffix is a year (19xx or 20xx)
    if (/^(19\d\d|20\d\d)$/.test(suffix)) {
      return { found: true, pattern: base + "[year]" };
    }

    // Check if suffix is numbers followed by special chars (e.g., "password123!@#")
    if (/^\d+[!@#$%^&*]+$/.test(suffix)) {
      return { found: true, pattern: base + "[numbers+special]" };
    }

    // Check if suffix is special chars followed by numbers (e.g., "password!@#123")
    if (/^[!@#$%^&*]+\d+$/.test(suffix)) {
      return { found: true, pattern: base + "[special+numbers]" };
    }

    // Check if suffix is a year followed by special chars (e.g., "password2024!@#")
    if (/^(19\d\d|20\d\d)[!@#$%^&*]+$/.test(suffix)) {
      return { found: true, pattern: base + "[year+special]" };
    }
  }

  return { found: false };
}

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

  // Check maximum length FIRST before any sanitization
  // This ensures we catch long passwords and provide a clear error message
  if (password.length > mergedPolicy.maxLength) {
    errors.push(`Password must be no more than ${mergedPolicy.maxLength} characters long`);
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

  // Sanitize input to prevent injection attacks (without length truncation since we already checked)
  const sanitizedPassword = sanitizeStringSimple(password, {
    maxLength: password.length, // Don't truncate, we already validated length
    preserveCase: true,
    preserveWhitespace: mergedPolicy.allowSpaces,
  });

  // Check if sanitization changed the password (injection patterns detected)
  if (sanitizedPassword !== password) {
    errors.push("Password contains invalid characters");
    return {
      valid: false,
      errors,
      strength: 0,
      strengthCategory: "weak",
    };
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

  // Check against blocked passwords (exact match only)
  // Substring matching is too aggressive and would reject valid passwords
  // like "SecurePass123!" that happen to contain common words
  const lowerPassword = password.toLowerCase();
  for (const blocked of mergedPolicy.blockedPasswords) {
    if (lowerPassword === blocked) {
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

  // Check sequential character patterns
  if (mergedPolicy.blockSequentialChars && mergedPolicy.maxSequentialChars > 0) {
    const sequentialResult = detectSequentialChars(password, mergedPolicy.maxSequentialChars);
    if (sequentialResult.found) {
      errors.push(
        `Password contains sequential characters (${sequentialResult.pattern}). Avoid using patterns like "1234" or "abcd".`
      );
    }
  }

  // Check keyboard walking patterns
  if (mergedPolicy.blockKeyboardPatterns) {
    const keyboardResult = detectKeyboardPatterns(password);
    if (keyboardResult.found) {
      errors.push(
        `Password contains keyboard pattern (${keyboardResult.pattern}). Avoid using keyboard sequences.`
      );
    }
  }

  // Check common password variations
  // Skip keyboard-based words when blockKeyboardPatterns is disabled
  const variationResult = detectCommonVariations(password, !mergedPolicy.blockKeyboardPatterns);
  if (variationResult.found) {
    errors.push(
      `Password contains a common variation pattern (${variationResult.pattern}). Please choose a more unique password.`
    );
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

  // Check minimum strength score
  if (strength < (mergedPolicy.minStrengthScore ?? 0)) {
    errors.push(
      `Password is too weak (strength: ${strength}/100). Please choose a stronger password.`
    );
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
 * Hash a password using Argon2id.
 *
 * Argon2id is the winner of the Password Hashing Competition (2015)
 * and is recommended by OWASP for new applications.
 *
 * Uses OWASP 2024 recommended parameters:
 * - Memory: 64 MiB
 * - Iterations: 3
 * - Parallelism: 4
 * - Salt length: 32 bytes
 * - Output length: 32 bytes
 *
 * @param password - The password to hash
 * @returns Promise containing the hash data
 */
export async function hashPassword(password: string): Promise<PasswordHash> {
  // Validate password is not empty
  if (!password || password.length === 0) {
    throw new Error("Password cannot be empty");
  }

  // Combine password with pepper for additional security (if configured)
  const pepper = getPasswordPepper();
  const passwordWithPepper = pepper ? password + pepper : password;

  // Hash using Argon2id with OWASP 2024 recommended parameters
  // The argon2 package handles salt generation automatically
  const hash = await argon2.hash(passwordWithPepper, ARGON2_OPTIONS);

  // Extract the salt from the encoded hash
  // Argon2 format: $argon2id$v=19$m=65536,t=3,p=4$salt$hash
  const parts = hash.split("$");
  const salt = parts[4]; // Extract salt from encoded hash

  return {
    hash,
    salt,
    algorithm: "argon2id",
    iterations: ARGON2_OPTIONS.timeCost ?? 3,
    memoryCost: ARGON2_OPTIONS.memoryCost,
    parallelism: ARGON2_OPTIONS.parallelism,
  };
}

/**
 * Verify a password against a stored Argon2id hash.
 *
 * Uses the argon2 package's built-in verify function which handles
 * timing-safe comparison to prevent timing attacks.
 *
 * @param password - The password to verify
 * @param hash - The stored Argon2id hash (encoded string)
 * @param salt - The salt used for hashing (not needed for Argon2, kept for API compatibility)
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
  if (!hash) {
    return false;
  }

  try {
    // Combine password with pepper for verification (must match hashing)
    const pepper = getPasswordPepper();
    const passwordWithPepper = pepper ? password + pepper : password;

    // Use argon2.verify which handles timing-safe comparison
    return await argon2.verify(hash, passwordWithPepper);
  } catch (error) {
    // If verification fails (invalid hash format, etc.), return false
    logger.warn("Password verification failed", { error: error as Error });
    return false;
  }
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
