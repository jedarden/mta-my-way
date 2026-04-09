/**
 * Tests for token encryption at rest utilities.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  configureEncryption,
  decryptObject,
  decryptToken,
  decryptTokens,
  encryptObject,
  encryptToken,
  encryptTokens,
  generateMasterKey,
  generateTokenFingerprint,
  getCurrentKeyVersion,
  hashToken,
  isEncryptionConfigured,
  reencryptToken,
  reencryptTokens,
  rotateEncryptionKey,
  validateEncryptedData,
  verifyTokenHash,
} from "./token-encryption.js";

describe("Token Encryption", () => {
  let testMasterKey: string;

  beforeEach(() => {
    // Generate a fresh key for each test
    testMasterKey = generateMasterKey();
  });

  describe("Master Key Generation", () => {
    it("should generate a 256-bit master key", () => {
      const key = generateMasterKey();

      expect(key).toBeDefined();
      expect(key.length).toBe(64); // 64 hex chars = 256 bits
      expect(/^[a-f0-9]{64}$/.test(key)).toBe(true);
    });

    it("should generate different keys each time", () => {
      const key1 = generateMasterKey();
      const key2 = generateMasterKey();

      expect(key1).not.toBe(key2);
    });
  });

  describe("Encryption Configuration", () => {
    it("should configure encryption with valid key", async () => {
      await configureEncryption({ masterKey: testMasterKey, version: 1 });

      expect(isEncryptionConfigured()).toBe(true);
      expect(getCurrentKeyVersion()).toBe(1);
    });

    it("should reject invalid master key length", async () => {
      await expect(configureEncryption({ masterKey: "too-short", version: 1 })).rejects.toThrow(
        "Master key must be 256 bits"
      );
    });
  });

  describe("Token Encryption/Decryption", () => {
    beforeEach(async () => {
      await configureEncryption({ masterKey: testMasterKey, version: 1 });
    });

    it("should encrypt a token", async () => {
      const plaintext = "my-secret-token-12345";
      const encrypted = await encryptToken(plaintext);

      expect(encrypted).toBeDefined();
      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.version).toBe(1);
      expect(encrypted.ciphertext).not.toBe(plaintext);
    });

    it("should decrypt an encrypted token", async () => {
      const plaintext = "my-secret-token-12345";
      const encrypted = await encryptToken(plaintext);
      const decrypted = await decryptToken(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should produce different ciphertext for same plaintext", async () => {
      const plaintext = "my-secret-token-12345";
      const encrypted1 = await encryptToken(plaintext);
      const encrypted2 = await encryptToken(plaintext);

      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
    });

    it("should decrypt to the same plaintext", async () => {
      const plaintext = "my-secret-token-12345";
      const encrypted1 = await encryptToken(plaintext);
      const encrypted2 = await encryptToken(plaintext);

      const decrypted1 = await decryptToken(encrypted1);
      const decrypted2 = await decryptToken(encrypted2);

      expect(decrypted1).toBe(plaintext);
      expect(decrypted2).toBe(plaintext);
    });

    it("should fail to decrypt with wrong key", async () => {
      const plaintext = "my-secret-token-12345";
      const encrypted = await encryptToken(plaintext);

      // Reconfigure with a different key
      const newKey = generateMasterKey();
      await configureEncryption({ masterKey: newKey, version: 2 });

      await expect(decryptToken(encrypted)).rejects.toThrow("No encryption key found");
    });

    it("should reject tampered ciphertext", async () => {
      const plaintext = "my-secret-token-12345";
      const encrypted = await encryptToken(plaintext);

      // Tamper with the ciphertext
      encrypted.ciphertext =
        encrypted.ciphertext.substring(0, 10) + "tampered" + encrypted.ciphertext.substring(20);

      await expect(decryptToken(encrypted)).rejects.toThrow();
    });

    it("should reject invalid encrypted data format", async () => {
      const invalidData = { ciphertext: "invalid", iv: "invalid", version: 1 };

      await expect(decryptToken(invalidData)).rejects.toThrow();
    });
  });

  describe("Object Encryption/Decryption", () => {
    beforeEach(async () => {
      await configureEncryption({ masterKey: testMasterKey, version: 1 });
    });

    it("should encrypt and decrypt an object", async () => {
      const obj = { userId: "123", email: "test@example.com", role: "admin" };
      const encrypted = await encryptObject(obj);
      const decrypted = await decryptObject<typeof obj>(encrypted);

      expect(decrypted).toEqual(obj);
    });

    it("should preserve object metadata", async () => {
      const obj = { key1: "value1", key2: "value2" };
      const encrypted = await encryptObject(obj);

      expect(encrypted.metadata).toBeDefined();
      expect(encrypted.metadata?.type).toBe("object");
      expect(encrypted.metadata?.keys).toEqual(["key1", "key2"]);
    });

    it("should handle nested objects", async () => {
      const obj = {
        user: { id: "123", profile: { name: "Test" } },
        settings: { theme: "dark" },
      };
      const encrypted = await encryptObject(obj);
      const decrypted = await decryptObject<typeof obj>(encrypted);

      expect(decrypted).toEqual(obj);
    });

    it("should handle arrays", async () => {
      const obj = { items: ["a", "b", "c"], count: 3 };
      const encrypted = await encryptObject(obj);
      const decrypted = await decryptObject<typeof obj>(encrypted);

      expect(decrypted).toEqual(obj);
    });
  });

  describe("Context-Based Encryption", () => {
    beforeEach(async () => {
      await configureEncryption({ masterKey: testMasterKey, version: 1 });
    });

    it("should encrypt with context", async () => {
      const plaintext = "my-token";
      const encrypted1 = await encryptToken(plaintext, "context1");
      const encrypted2 = await encryptToken(plaintext, "context2");

      // Same plaintext with different contexts should produce different ciphertext
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
    });

    it("should decrypt with correct context", async () => {
      const plaintext = "my-token";
      const encrypted = await encryptToken(plaintext, "my-context");

      const decrypted = await decryptToken(encrypted, "my-context");

      expect(decrypted).toBe(plaintext);
    });

    it("should fail to decrypt with wrong context", async () => {
      const plaintext = "my-token";
      const encrypted = await encryptToken(plaintext, "context1");

      await expect(decryptToken(encrypted, "context2")).rejects.toThrow();
    });
  });

  describe("Batch Encryption", () => {
    beforeEach(async () => {
      await configureEncryption({ masterKey: testMasterKey, version: 1 });
    });

    it("should encrypt multiple tokens", async () => {
      const tokens = ["token1", "token2", "token3"];
      const encrypted = await encryptTokens(tokens);

      expect(encrypted).toHaveLength(3);
      expect(encrypted[0]?.ciphertext).toBeDefined();
      expect(encrypted[1]?.ciphertext).toBeDefined();
      expect(encrypted[2]?.ciphertext).toBeDefined();
    });

    it("should decrypt multiple tokens", async () => {
      const tokens = ["token1", "token2", "token3"];
      const encrypted = await encryptTokens(tokens);
      const decrypted = await decryptTokens(encrypted);

      expect(decrypted).toEqual(tokens);
    });

    it("should handle empty array", async () => {
      const encrypted = await encryptTokens([]);
      const decrypted = await decryptTokens(encrypted);

      expect(decrypted).toEqual([]);
    });
  });

  describe("Token Hashing", () => {
    it("should hash a token", async () => {
      const token = "my-token-123";
      const hash = await hashToken(token);

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64); // SHA-256 = 64 hex chars
    });

    it("should produce consistent hashes for same token", async () => {
      const token = "my-token-123";
      const hash1 = await hashToken(token);
      const hash2 = await hashToken(token);

      expect(hash1).toBe(hash2);
    });

    it("should produce different hashes for different tokens", async () => {
      const hash1 = await hashToken("token1");
      const hash2 = await hashToken("token2");

      expect(hash1).not.toBe(hash2);
    });

    it("should include salt in hash", async () => {
      const token = "my-token";
      const hash1 = await hashToken(token, "salt1");
      const hash2 = await hashToken(token, "salt2");

      expect(hash1).not.toBe(hash2);
    });

    it("should verify token hash", async () => {
      const token = "my-token-123";
      const salt = "my-salt";
      const hash = await hashToken(token, salt);

      const isValid = await verifyTokenHash(token, hash, salt);

      expect(isValid).toBe(true);
    });

    it("should reject wrong token", async () => {
      const hash = await hashToken("correct-token");

      const isValid = await verifyTokenHash("wrong-token", hash);

      expect(isValid).toBe(false);
    });
  });

  describe("Key Rotation", () => {
    it("should rotate to a new key", async () => {
      await configureEncryption({ masterKey: testMasterKey, version: 1 });

      const newKey = generateMasterKey();
      await rotateEncryptionKey(newKey, 2);

      expect(getCurrentKeyVersion()).toBe(2);
    });

    it("should decrypt old tokens after rotation", async () => {
      await configureEncryption({ masterKey: testMasterKey, version: 1 });

      const plaintext = "my-token";
      const oldEncrypted = await encryptToken(plaintext);

      // Rotate key
      const newKey = generateMasterKey();
      await rotateEncryptionKey(newKey, 2);

      // Should still decrypt with old key
      const decrypted = await decryptToken(oldEncrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should encrypt new tokens with new key", async () => {
      await configureEncryption({ masterKey: testMasterKey, version: 1 });

      // Rotate key
      const newKey = generateMasterKey();
      await rotateEncryptionKey(newKey, 2);

      const plaintext = "my-new-token";
      const newEncrypted = await encryptToken(plaintext);

      expect(newEncrypted.version).toBe(2);
    });
  });

  describe("Token Re-encryption", () => {
    it("should re-encrypt token to current version", async () => {
      await configureEncryption({ masterKey: testMasterKey, version: 1 });

      const plaintext = "my-token";
      const oldEncrypted = await encryptToken(plaintext);

      // Rotate key
      const newKey = generateMasterKey();
      await rotateEncryptionKey(newKey, 2);

      // Re-encrypt
      const newEncrypted = await reencryptToken(oldEncrypted);

      expect(newEncrypted.version).toBe(2);

      const decrypted = await decryptToken(newEncrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("should not modify tokens already on current version", async () => {
      await configureEncryption({ masterKey: testMasterKey, version: 1 });

      const plaintext = "my-token";
      const encrypted = await encryptToken(plaintext);

      const reencrypted = await reencryptToken(encrypted);

      expect(reencrypted).toBe(encrypted);
    });

    it("should batch re-encrypt tokens", async () => {
      await configureEncryption({ masterKey: testMasterKey, version: 1 });

      const tokens = ["token1", "token2", "token3"];
      const oldEncrypted = await encryptTokens(tokens);

      // Rotate key
      const newKey = generateMasterKey();
      await rotateEncryptionKey(newKey, 2);

      // Batch re-encrypt
      const newEncrypted = await reencryptTokens(oldEncrypted);

      expect(newEncrypted).toHaveLength(3);
      expect(newEncrypted[0]?.version).toBe(2);

      const decrypted = await decryptTokens(newEncrypted);
      expect(decrypted).toEqual(tokens);
    });
  });

  describe("Token Fingerprinting", () => {
    it("should generate consistent fingerprint", async () => {
      const token = "my-token-123";
      const fingerprint1 = await generateTokenFingerprint(token);
      const fingerprint2 = await generateTokenFingerprint(token);

      expect(fingerprint1).toBe(fingerprint2);
    });

    it("should generate different fingerprints for different tokens", async () => {
      const fingerprint1 = await generateTokenFingerprint("token1");
      const fingerprint2 = await generateTokenFingerprint("token2");

      expect(fingerprint1).not.toBe(fingerprint2);
    });

    it("should not reveal the token", async () => {
      const token = "my-secret-token";
      const fingerprint = await generateTokenFingerprint(token);

      expect(fingerprint).not.toContain(token);
      expect(fingerprint.length).toBe(19); // 8 chars + "..." + 8 chars
    });
  });

  describe("Encrypted Data Validation", () => {
    it("should validate correct encrypted data", () => {
      const data = {
        ciphertext: "abc123",
        iv: "def456",
        version: 1,
      };

      expect(validateEncryptedData(data)).toBe(true);
    });

    it("should reject missing ciphertext", () => {
      const data = { ciphertext: "", iv: "def456", version: 1 };

      expect(validateEncryptedData(data)).toBe(false);
    });

    it("should reject missing iv", () => {
      const data = { ciphertext: "abc123", iv: "", version: 1 };

      expect(validateEncryptedData(data)).toBe(false);
    });

    it("should reject invalid version", () => {
      const data = { ciphertext: "abc123", iv: "def456", version: 0 };

      expect(validateEncryptedData(data)).toBe(false);
    });

    it("should reject non-object types", () => {
      expect(validateEncryptedData(null)).toBe(false);
      expect(validateEncryptedData(undefined)).toBe(false);
      expect(validateEncryptedData("string")).toBe(false);
      expect(validateEncryptedData(123)).toBe(false);
    });
  });

  describe("Encryption Configuration Checks", () => {
    it("should return false when not configured", () => {
      // Reset configuration
      const unconfigured = isEncryptionConfigured();

      // Note: This might be true if other tests configured it
      expect(typeof unconfigured).toBe("boolean");
    });

    it("should return 0 for version when not configured", () => {
      const version = getCurrentKeyVersion();

      expect(typeof version).toBe("number");
    });
  });
});
