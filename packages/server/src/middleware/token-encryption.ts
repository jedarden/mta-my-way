/**
 * Token encryption at rest utilities.
 *
 * Provides AES-GCM encryption for storing sensitive tokens and secrets.
 * Uses Web Crypto API for secure cryptographic operations.
 *
 * Use Cases:
 * - Encrypting refresh tokens before database storage
 * - Encrypting API keys in persistent storage
 * - Encrypting session data for persistence
 * - Encrypting OAuth secrets
 *
 * Security Features:
 * - AES-GCM (Galois/Counter Mode) for authenticated encryption
 * - 256-bit keys (AES-256)
 * - 96-bit IV (initialization vector)
 * - Automatic key derivation from master secret
 * - Key versioning for rotation support
 */

import { logger } from "../observability/logger.js";

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Encrypted data format.
 */
export interface EncryptedData {
  /** Base64-encoded ciphertext */
  ciphertext: string;
  /** Base64-encoded IV (initialization vector) */
  iv: string;
  /** Key version for rotation support */
  version: number;
  /** Authentication tag (included in ciphertext for GCM) */
  tag?: string;
}

/**
 * Encryption configuration.
 */
export interface EncryptionConfig {
  /** Master encryption key (hex encoded, 64 chars = 256 bits) */
  masterKey: string;
  /** Current key version (for rotation) */
  version?: number;
}

/**
 * Key derivation options.
 */
export interface KeyDerivationOptions {
  /** Context identifier for key derivation */
  context?: string;
  /** Salt for key derivation (optional, generates if not provided) */
  salt?: string;
}

// ============================================================================
// Key Management
// ============================================================================

/**
 * Current encryption configuration.
 * Initialize with configureEncryption() before using encrypt/decrypt.
 */
let encryptionConfig: {
  masterKey: CryptoKey;
  masterKeyRaw: Uint8Array;
  version: number;
} | null = null;

/**
 * Old encryption keys for decryption during rotation.
 */
const oldKeys = new Map<number, CryptoKey>();

/**
 * Configure token encryption.
 *
 * Call this during app initialization with a secure master key.
 * The master key should be 256 bits (64 hex characters).
 *
 * @example
 * ```ts
 * configureEncryption({
 *   masterKey: process.env.ENCRYPTION_KEY, // 64 hex chars
 *   version: 1,
 * });
 * ```
 */
export async function configureEncryption(config: EncryptionConfig): Promise<void> {
  if (config.masterKey.length !== 64) {
    throw new Error("Master key must be 256 bits (64 hex characters)");
  }

  const encoder = new TextEncoder();
  const keyBytes = new Uint8Array(
    config.masterKey.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) || []
  );

  const masterKey = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);

  encryptionConfig = {
    masterKey,
    masterKeyRaw: keyBytes,
    version: config.version || 1,
  };

  logger.info("Token encryption configured", { version: encryptionConfig.version });
}

/**
 * Rotate to a new encryption key.
 *
 * Adds the current key to old keys (for decryption) and sets the new key as current.
 *
 * @example
 * ```ts
 * await rotateEncryptionKey(newMasterKey, 2);
 * ```
 */
export async function rotateEncryptionKey(newMasterKey: string, newVersion: number): Promise<void> {
  if (!encryptionConfig) {
    throw new Error("Encryption not configured. Call configureEncryption() first.");
  }

  // Store current key as old key
  oldKeys.set(encryptionConfig.version, encryptionConfig.masterKey);

  // Configure new key
  await configureEncryption({ masterKey: newMasterKey, version: newVersion });

  logger.info("Encryption key rotated", {
    oldVersion: newVersion - 1,
    newVersion,
  });
}

/**
 * Generate a cryptographically secure master key.
 *
 * Useful for initial setup or key rotation.
 * Returns a 64-character hex string (256 bits).
 */
export function generateMasterKey(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Derive an encryption key from the master key with context.
 *
 * Uses HKDF (HMAC-based Key Derivation Function) to derive
 * context-specific keys from the master key.
 *
 * @param context - Context identifier (e.g., "refresh_tokens", "api_keys")
 * @returns Derived CryptoKey
 */
export async function deriveEncryptionKey(
  context: string,
  options: KeyDerivationOptions = {}
): Promise<CryptoKey> {
  if (!encryptionConfig) {
    throw new Error("Encryption not configured. Call configureEncryption() first.");
  }

  const { context: contextOption, salt } = options;
  const fullContext = contextOption || context;

  // Use provided salt or derive a deterministic salt from the context
  let saltBytes: Uint8Array;
  if (salt) {
    saltBytes = new TextEncoder().encode(salt);
  } else {
    // Derive a deterministic salt from the context string
    const contextHash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(fullContext)
    );
    saltBytes = new Uint8Array(contextHash).slice(0, 16);
  }

  // Import the raw master key for HKDF derivation
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    encryptionConfig.masterKeyRaw,
    { name: "HKDF" },
    false,
    ["deriveBits", "deriveKey"]
  );

  // Use HKDF to derive a key from the master key
  const encoder = new TextEncoder();
  const info = encoder.encode(fullContext);

  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: saltBytes,
      info,
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  return derivedKey;
}

/**
 * Get an encryption key by version.
 *
 * Returns the current key or an old key for decryption during rotation.
 */
async function getKeyByVersion(version: number): Promise<CryptoKey | null> {
  if (encryptionConfig && encryptionConfig.version === version) {
    return encryptionConfig.masterKey;
  }

  return oldKeys.get(version) || null;
}

// ============================================================================
// Encryption/Decryption
// ============================================================================

/**
 * Encrypt data using AES-GCM.
 *
 * @param plaintext - Data to encrypt (will be converted to string)
 * @param context - Optional context for key derivation
 * @returns Encrypted data with IV and version
 */
export async function encryptToken(plaintext: string, context?: string): Promise<EncryptedData> {
  if (!encryptionConfig) {
    throw new Error("Encryption not configured. Call configureEncryption() first.");
  }

  const key = context ? await deriveEncryptionKey(context) : encryptionConfig.masterKey;

  // Generate IV (96 bits for GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    plaintextBytes
  );

  // Combine ciphertext and auth tag (GCM appends tag)
  const ciphertextArray = new Uint8Array(ciphertext);

  return {
    ciphertext: btoa(String.fromCharCode(...ciphertextArray)),
    iv: btoa(String.fromCharCode(...iv)),
    version: encryptionConfig.version,
  };
}

/**
 * Decrypt data using AES-GCM.
 *
 * @param encrypted - Encrypted data object
 * @param context - Optional context for key derivation
 * @returns Decrypted plaintext string
 * @throws Error if decryption fails or key not found
 */
export async function decryptToken(encrypted: EncryptedData, context?: string): Promise<string> {
  // Get the appropriate key for this version
  const key = context
    ? await deriveEncryptionKey(context)
    : await getKeyByVersion(encrypted.version);

  if (!key) {
    throw new Error(`No encryption key found for version ${encrypted.version}`);
  }

  // Decode from base64
  const ciphertext = Uint8Array.from(atob(encrypted.ciphertext), (c) => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(encrypted.iv), (c) => c.charCodeAt(0));

  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    ciphertext
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Encrypt a JSON object.
 *
 * Convenience function that stringifies, encrypts, and stores metadata.
 */
export async function encryptObject<T extends Record<string, unknown>>(
  obj: T,
  context?: string
): Promise<EncryptedData & { metadata: { type: "object"; keys: string[] } }> {
  const plaintext = JSON.stringify(obj);
  const encrypted = await encryptToken(plaintext, context);

  return {
    ...encrypted,
    metadata: {
      type: "object",
      keys: Object.keys(obj),
    },
  };
}

/**
 * Decrypt a JSON object.
 *
 * Convenience function that decrypts and parses.
 */
export async function decryptObject<T extends Record<string, unknown>>(
  encrypted: EncryptedData & { metadata?: { type: string; keys?: string[] } },
  context?: string
): Promise<T> {
  const plaintext = await decryptToken(encrypted, context);
  return JSON.parse(plaintext) as T;
}

// ============================================================================
// Batch Encryption for Token Storage
// ============================================================================

/**
 * Encrypt multiple tokens at once.
 *
 * Useful for batch operations like migrating existing tokens.
 */
export async function encryptTokens(tokens: string[], context?: string): Promise<EncryptedData[]> {
  const results: EncryptedData[] = [];

  for (const token of tokens) {
    try {
      const encrypted = await encryptToken(token, context);
      results.push(encrypted);
    } catch (error) {
      logger.error("Failed to encrypt token", { error });
      throw error;
    }
  }

  return results;
}

/**
 * Decrypt multiple tokens at once.
 */
export async function decryptTokens(
  encryptedTokens: EncryptedData[],
  context?: string
): Promise<string[]> {
  const results: string[] = [];

  for (const encrypted of encryptedTokens) {
    try {
      const decrypted = await decryptToken(encrypted, context);
      results.push(decrypted);
    } catch (error) {
      logger.error("Failed to decrypt token", { error, version: encrypted.version });
      throw error;
    }
  }

  return results;
}

// ============================================================================
// Token Hashing (for verification without decryption)
// ============================================================================

/**
 * Hash a token for verification without storing the plaintext.
 *
 * Uses SHA-256 for one-way hashing. Useful for:
 * - Verifying tokens without decrypting them
 * - Creating token fingerprints for audit logs
 * - Secure token comparison
 */
export async function hashToken(token: string, salt?: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token + (salt || ""));

  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verify a token against its hash.
 *
 * @param token - Token to verify
 * @param hash - Expected hash
 * @param salt - Salt used for hashing (if any)
 */
export async function verifyTokenHash(
  token: string,
  hash: string,
  salt?: string
): Promise<boolean> {
  const computedHash = await hashToken(token, salt);
  return computedHash === hash;
}

// ============================================================================
// Token Rotation Utilities
// ============================================================================

/**
 * Re-encrypt a token with the current key version.
 *
 * Useful during key rotation to update stored tokens.
 *
 * @param oldEncrypted - Token encrypted with an old key version
 * @param context - Optional context for key derivation
 * @returns Token encrypted with the current key version
 */
export async function reencryptToken(
  oldEncrypted: EncryptedData,
  context?: string
): Promise<EncryptedData> {
  if (!encryptionConfig) {
    throw new Error("Encryption not configured. Call configureEncryption() first.");
  }

  // Check if re-encryption is needed
  if (oldEncrypted.version === encryptionConfig.version) {
    return oldEncrypted; // Already on current version
  }

  // Decrypt with old key
  const plaintext = await decryptToken(oldEncrypted, context);

  // Encrypt with current key
  const newEncrypted = await encryptToken(plaintext, context);

  logger.debug("Token re-encrypted", {
    oldVersion: oldEncrypted.version,
    newVersion: newEncrypted.version,
  });

  return newEncrypted;
}

/**
 * Batch re-encrypt tokens to current key version.
 *
 * @param oldEncryptedTokens - Tokens encrypted with old key versions
 * @param context - Optional context for key derivation
 * @returns Tokens encrypted with the current key version
 */
export async function reencryptTokens(
  oldEncryptedTokens: EncryptedData[],
  context?: string
): Promise<EncryptedData[]> {
  const results: EncryptedData[] = [];

  for (const oldEncrypted of oldEncryptedTokens) {
    try {
      const reencrypted = await reencryptToken(oldEncrypted, context);
      results.push(reencrypted);
    } catch (error) {
      logger.error("Failed to re-encrypt token", { error, version: oldEncrypted.version });
      throw error;
    }
  }

  return results;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if encryption is configured.
 */
export function isEncryptionConfigured(): boolean {
  return encryptionConfig !== null;
}

/**
 * Get the current encryption key version.
 */
export function getCurrentKeyVersion(): number {
  return encryptionConfig?.version ?? 0;
}

/**
 * Setup token encryption from environment variables.
 *
 * Convenience function that reads from environment and configures encryption.
 * Use this during application startup.
 *
 * @example
 * ```ts
 * import { setupTokenEncryption } from './middleware/token-encryption.js';
 *
 * // In your app initialization
 * await setupTokenEncryption();
 * ```
 */
export async function setupTokenEncryption(): Promise<void> {
  const encryptionKey = globalThis.process?.env.TOKEN_ENCRYPTION_KEY;

  if (!encryptionKey) {
    logger.warn("TOKEN_ENCRYPTION_KEY not set, tokens will be stored in plaintext");
    return;
  }

  await configureEncryption({
    masterKey: encryptionKey,
    version: 1,
  });

  logger.info("Token encryption configured from environment");
}

/**
 * Validate encrypted data format.
 */
export function validateEncryptedData(data: unknown): data is EncryptedData {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  const encrypted = data as Record<string, unknown>;

  return (
    typeof encrypted.ciphertext === "string" &&
    encrypted.ciphertext.length > 0 &&
    typeof encrypted.iv === "string" &&
    encrypted.iv.length > 0 &&
    typeof encrypted.version === "number" &&
    encrypted.version > 0
  );
}

/**
 * Generate a token fingerprint for audit logging.
 *
 * Creates a consistent identifier for a token without revealing the token itself.
 */
export async function generateTokenFingerprint(token: string): Promise<string> {
  // Use first 8 and last 8 characters of hash (8 + 3 dots + 8 = 19)
  const hash = await hashToken(token);
  const prefix = hash.substring(0, 8);
  const suffix = hash.substring(hash.length - 8);
  return `${prefix}...${suffix}`; // Total: 8 + 3 + 8 = 19 characters
}
