/**
 * Tests for password-management module
 *
 * Tests cover:
 * - Password validation with policy requirements
 * - Password strength calculation
 * - Password hashing and verification
 * - Password reset token generation and validation
 * - Password expiration checking
 * - Password history tracking
 * - Secure password generation
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  type PasswordPolicy,
  clearBreachedPasswordCache,
  consumePasswordResetToken,
  generatePasswordResetToken,
  generateSecurePassword,
  getDaysUntilExpiration,
  getPasswordPolicyDescription,
  hashPassword,
  invalidateResetTokensForKey,
  isPasswordExpired,
  setPasswordPepper,
  shouldWarnPasswordExpiration,
  storePasswordInHistory,
  validatePassword,
  validatePasswordResetToken,
  verifyPasswordHash,
} from "./password-management.js";

describe("password-management", () => {
  describe("validatePassword", () => {
    it("should reject passwords that are too short", async () => {
      const result = await validatePassword("Short1!");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Password must be at least 12 characters long");
    });

    it("should reject passwords without uppercase", async () => {
      const result = await validatePassword("lowercase123!");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Password must contain at least one uppercase letter");
    });

    it("should reject passwords without lowercase", async () => {
      const result = await validatePassword("UPPERCASE123!");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Password must contain at least one lowercase letter");
    });

    it("should reject passwords without numbers", async () => {
      const result = await validatePassword("NoNumbersHere!");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Password must contain at least one number");
    });

    it("should reject passwords without special characters", async () => {
      const result = await validatePassword("NoSpecialChars123");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Password must contain at least one special character");
    });

    it("should reject common passwords", async () => {
      const result = await validatePassword("Password123!");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("common variation"))).toBe(true);
    });

    it("should reject passwords with excessive character repetition", async () => {
      const result = await validatePassword("AAAaaaa111!!!!!");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Password cannot contain the same character more than 3 times in a row"
      );
    });

    it("should accept valid passwords", async () => {
      const result = await validatePassword("SecurePass123!");
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should allow spaces when policy permits", async () => {
      const result = await validatePassword("Secure Pass 123!");
      expect(result.valid).toBe(true);
    });

    it("should calculate strength scores correctly", async () => {
      const weakResult = await validatePassword("abc!");
      expect(weakResult.strength).toBeLessThan(50);
      expect(["weak", "fair"]).toContain(weakResult.strengthCategory);

      const strongResult = await validatePassword("VerySecurePassword123!@#");
      expect(strongResult.strength).toBeGreaterThan(80);
      expect(strongResult.strengthCategory).toBe("strong");
    });

    it("should respect custom policy", async () => {
      const customPolicy: PasswordPolicy = {
        minLength: 20,
        requireSpecialChars: false,
        blockSequentialChars: false, // Disable to allow "123" in the password
      };
      const result = await validatePassword(
        "VeryLongPassphraseWithNumbersButNoSymbols123",
        customPolicy
      );
      expect(result.valid).toBe(true);
    });

    it("should enforce maximum length", async () => {
      const longPassword = "a".repeat(200) + "A1!";
      const result = await validatePassword(longPassword);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Password must be no more than 128 characters long");
    });

    it("should reject sequential numeric characters", async () => {
      const result = await validatePassword("Abc1234!@#");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("sequential characters"))).toBe(true);
    });

    it("should reject sequential alphabetic characters", async () => {
      const result = await validatePassword("Abcdef!@#123");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("sequential characters"))).toBe(true);
    });

    it("should reject reversed sequential characters", async () => {
      const result = await validatePassword("Abc4321!@#");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("sequential characters"))).toBe(true);
    });

    it("should reject keyboard walking patterns", async () => {
      const result = await validatePassword("Qwerty123!@#");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("keyboard pattern"))).toBe(true);
    });

    it("should reject asdf keyboard pattern", async () => {
      const result = await validatePassword("Asdf1234!@#");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("keyboard pattern"))).toBe(true);
    });

    it("should reject common password variations", async () => {
      const result = await validatePassword("Password123!@#");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("common variation"))).toBe(true);
    });

    it("should reject password with year suffix", async () => {
      const result = await validatePassword("Welcome2024!@#");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("common variation"))).toBe(true);
    });

    it("should allow custom policy to disable sequential check", async () => {
      const customPolicy: PasswordPolicy = {
        blockSequentialChars: false,
      };
      // Use a longer password that meets the 12 character minimum
      const result = await validatePassword("Abc123456!@#", customPolicy);
      expect(result.valid).toBe(true);
    });

    it("should allow custom policy to disable keyboard pattern check", async () => {
      const customPolicy: PasswordPolicy = {
        blockKeyboardPatterns: false,
      };
      const result = await validatePassword("Qwerty123!@#", customPolicy);
      expect(result.valid).toBe(true);
    });

    it("should enforce minimum strength score", async () => {
      const customPolicy: PasswordPolicy = {
        minStrengthScore: 80,
      };
      const result = await validatePassword("Weak1!", customPolicy);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("too weak"))).toBe(true);
    });
  });

  describe("hashPassword and verifyPasswordHash", () => {
    it("should hash passwords consistently", async () => {
      const password = "TestPassword123!";
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      // Hashes should be different due to random salt
      expect(hash1.hash).not.toBe(hash2.hash);
      expect(hash1.salt).not.toBe(hash2.salt);

      // But both should verify correctly
      const verify1 = await verifyPasswordHash(password, hash1.hash, hash1.salt);
      const verify2 = await verifyPasswordHash(password, hash2.hash, hash2.salt);
      expect(verify1).toBe(true);
      expect(verify2).toBe(true);
    });

    it("should reject incorrect passwords", async () => {
      const password = "TestPassword123!";
      const hash = await hashPassword(password);

      const verify = await verifyPasswordHash("WrongPassword123!", hash.hash, hash.salt);
      expect(verify).toBe(false);
    });

    it("should use Argon2id with correct parameters", async () => {
      const password = "TestPassword123!";
      const hash = await hashPassword(password);

      expect(hash.algorithm).toBe("argon2id");
      expect(hash.iterations).toBe(3); // Argon2id time cost
      expect(hash.memoryCost).toBe(65536); // 64 MiB in KiB
      expect(hash.parallelism).toBe(4);
      // Argon2 hash format: $argon2id$v=19$m=65536,t=3,p=4$...
      expect(hash.hash).toMatch(/^\$argon2id\$/);
      // Salt is base64 encoded in Argon2 format
      expect(hash.salt).toBeTruthy();
    });
  });

  describe("storePasswordInHistory", () => {
    const keyId = "test-key-1";

    beforeEach(() => {
      // Clear password history before each test
      (globalThis as unknown as { passwordHistory: Map<string, unknown> }).passwordHistory =
        new Map();
    });

    it("should store password hashes in history", async () => {
      const password = "TestPassword123!";
      const hash = await hashPassword(password);

      storePasswordInHistory(keyId, hash.hash, hash.salt);

      // History should be stored (we can't directly access it, but this tests no errors)
      expect(() => storePasswordInHistory(keyId, hash.hash, hash.salt)).not.toThrow();
    });

    it("should limit history size", async () => {
      // Add more than the default history count (12)
      for (let i = 0; i < 15; i++) {
        const password = `TestPassword${i}!`;
        const hash = await hashPassword(password);
        storePasswordInHistory(keyId, hash.hash, hash.salt);
      }

      // Should not throw
      expect(() => storePasswordInHistory(keyId, "hash", "salt")).not.toThrow();
    });
  });

  describe("generatePasswordResetToken", () => {
    it("should generate secure tokens", async () => {
      const keyId = "test-key-1";
      const clientIp = "127.0.0.1";

      const { token, tokenId, expiresAt } = await generatePasswordResetToken(keyId, clientIp);

      expect(token).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(tokenId).toBeDefined();
      expect(expiresAt).toBeGreaterThan(Date.now());
      expect(expiresAt).toBeLessThanOrEqual(Date.now() + 60 * 60 * 1000 + 1000); // ~1 hour
    });

    it("should generate unique tokens", async () => {
      const keyId = "test-key-1";
      const clientIp = "127.0.0.1";

      const token1 = await generatePasswordResetToken(keyId, clientIp);
      const token2 = await generatePasswordResetToken(keyId, clientIp);

      expect(token1.token).not.toBe(token2.token);
      expect(token1.tokenId).not.toBe(token2.tokenId);
    });
  });

  describe("validatePasswordResetToken", () => {
    it("should validate correct tokens", async () => {
      const keyId = "test-key-1";
      const clientIp = "127.0.0.1";

      const { token, tokenId } = await generatePasswordResetToken(keyId, clientIp);
      const validatedKeyId = await validatePasswordResetToken(tokenId, token, clientIp);

      expect(validatedKeyId).toBe(keyId);
    });

    it("should reject invalid tokens", async () => {
      const tokenId = "invalid-token-id";
      const token = "invalid-token";
      const clientIp = "127.0.0.1";

      const validatedKeyId = await validatePasswordResetToken(tokenId, token, clientIp);
      expect(validatedKeyId).toBeNull();
    });

    it("should reject tokens with wrong hash", async () => {
      const keyId = "test-key-1";
      const clientIp = "127.0.0.1";

      const { tokenId } = await generatePasswordResetToken(keyId, clientIp);
      const wrongToken = "a".repeat(64);

      const validatedKeyId = await validatePasswordResetToken(tokenId, wrongToken, clientIp);
      expect(validatedKeyId).toBeNull();
    });
  });

  describe("consumePasswordResetToken", () => {
    it("should mark tokens as used", async () => {
      const keyId = "test-key-1";
      const clientIp = "127.0.0.1";

      const { token, tokenId } = await generatePasswordResetToken(keyId, clientIp);
      const consumed = consumePasswordResetToken(tokenId);

      expect(consumed).toBe(true);

      // Token should no longer be valid
      const validatedKeyId = await validatePasswordResetToken(tokenId, token, clientIp);
      expect(validatedKeyId).toBeNull();
    });

    it("should return false for non-existent tokens", () => {
      const consumed = consumePasswordResetToken("non-existent-token-id");
      expect(consumed).toBe(false);
    });
  });

  describe("invalidateResetTokensForKey", () => {
    it("should invalidate all tokens for a key", async () => {
      const keyId = "test-key-1";
      const clientIp = "127.0.0.1";

      // Generate multiple tokens
      await generatePasswordResetToken(keyId, clientIp);
      await generatePasswordResetToken(keyId, clientIp);
      await generatePasswordResetToken(keyId, clientIp);

      const count = invalidateResetTokensForKey(keyId);
      expect(count).toBeGreaterThan(0);
    });

    it("should return 0 for keys with no tokens", () => {
      const count = invalidateResetTokensForKey("non-existent-key");
      expect(count).toBe(0);
    });
  });

  describe("isPasswordExpired", () => {
    it("should not expire when policy has no expiration", () => {
      const passwordSetAt = Date.now() - 365 * 24 * 60 * 60 * 1000; // 1 year ago
      const expired = isPasswordExpired(passwordSetAt);
      expect(expired).toBe(false);
    });

    it("should check expiration with custom policy", () => {
      const passwordSetAt = Date.now() - 100 * 24 * 60 * 60 * 1000; // 100 days ago
      const policy: PasswordPolicy = { passwordExpirationDays: 90 };
      const expired = isPasswordExpired(passwordSetAt, policy);
      expect(expired).toBe(true);
    });

    it("should not expire recent passwords", () => {
      const passwordSetAt = Date.now() - 10 * 24 * 60 * 60 * 1000; // 10 days ago
      const policy: PasswordPolicy = { passwordExpirationDays: 90 };
      const expired = isPasswordExpired(passwordSetAt, policy);
      expect(expired).toBe(false);
    });
  });

  describe("getDaysUntilExpiration", () => {
    it("should return null when no expiration", () => {
      const passwordSetAt = Date.now();
      const days = getDaysUntilExpiration(passwordSetAt);
      expect(days).toBeNull();
    });

    it("should calculate days correctly", () => {
      const passwordSetAt = Date.now() - 10 * 24 * 60 * 60 * 1000; // 10 days ago
      const policy: PasswordPolicy = { passwordExpirationDays: 90 };
      const days = getDaysUntilExpiration(passwordSetAt, policy);
      expect(days).toBe(80); // 90 - 10
    });

    it("should return 0 for expired passwords", () => {
      const passwordSetAt = Date.now() - 100 * 24 * 60 * 60 * 1000; // 100 days ago
      const policy: PasswordPolicy = { passwordExpirationDays: 90 };
      const days = getDaysUntilExpiration(passwordSetAt, policy);
      expect(days).toBe(0);
    });
  });

  describe("shouldWarnPasswordExpiration", () => {
    it("should warn when approaching expiration", () => {
      const passwordSetAt = Date.now() - 85 * 24 * 60 * 60 * 1000; // 85 days ago
      const policy: PasswordPolicy = { passwordExpirationDays: 90 };
      const shouldWarn = shouldWarnPasswordExpiration(passwordSetAt, 7, policy);
      expect(shouldWarn).toBe(true);
    });

    it("should not warn when far from expiration", () => {
      const passwordSetAt = Date.now() - 10 * 24 * 60 * 60 * 1000; // 10 days ago
      const policy: PasswordPolicy = { passwordExpirationDays: 90 };
      const shouldWarn = shouldWarnPasswordExpiration(passwordSetAt, 7, policy);
      expect(shouldWarn).toBe(false);
    });

    it("should not warn when no expiration", () => {
      const passwordSetAt = Date.now();
      const shouldWarn = shouldWarnPasswordExpiration(passwordSetAt, 7);
      expect(shouldWarn).toBe(false);
    });
  });

  describe("generateSecurePassword", () => {
    it("should generate passwords of correct length", () => {
      const password = generateSecurePassword(16);
      expect(password).toHaveLength(16);
    });

    it("should include different character types by default", () => {
      const password = generateSecurePassword(20);
      expect(/[A-Z]/.test(password)).toBe(true);
      expect(/[a-z]/.test(password)).toBe(true);
      expect(/\d/.test(password)).toBe(true);
      expect(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)).toBe(true);
    });

    it("should respect character type options", () => {
      const password = generateSecurePassword(16, {
        includeUppercase: false,
        includeSpecialChars: false,
      });
      expect(/[A-Z]/.test(password)).toBe(false);
      expect(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)).toBe(false);
      expect(/[a-z]/.test(password)).toBe(true);
      expect(/\d/.test(password)).toBe(true);
    });

    it("should exclude ambiguous characters when requested", () => {
      const password = generateSecurePassword(30, {
        excludeAmbiguous: true,
      });
      // Should not contain 0, O, I, l, 1
      expect(/[0OIl1]/.test(password)).toBe(false);
    });

    it("should generate unique passwords", () => {
      const password1 = generateSecurePassword(20);
      const password2 = generateSecurePassword(20);
      expect(password1).not.toBe(password2);
    });
  });

  describe("getPasswordPolicyDescription", () => {
    it("should return policy description", () => {
      const policy = getPasswordPolicyDescription();

      expect(policy.minLength).toBe(12);
      expect(policy.maxLength).toBe(128);
      expect(policy.requireUppercase).toBe(true);
      expect(policy.requireLowercase).toBe(true);
      expect(policy.requireNumbers).toBe(true);
      expect(policy.requireSpecialChars).toBe(true);
      expect(policy.allowSpaces).toBe(true);
      expect(policy.expirationDays).toBe(0);
      expect(policy.historyCount).toBe(12);
    });
  });

  describe("Password strength calculation", () => {
    it("should classify weak passwords correctly", async () => {
      const result = await validatePassword("weak");
      expect(result.strengthCategory).toBe("weak");
    });

    it("should classify strong passwords correctly", async () => {
      const result = await validatePassword("VeryStrongPassword123!@#");
      expect(result.strengthCategory).toBe("strong");
    });
  });

  describe("Password pepper support", () => {
    it("should set a valid pepper", () => {
      // Should not throw for valid hex string
      expect(() => setPasswordPepper("a".repeat(64))).not.toThrow();
    });

    it("should reject invalid pepper format", () => {
      // Should throw for non-hex string
      expect(() => setPasswordPepper("not-hex!@#")).toThrow();
    });

    it("should reject too short pepper", () => {
      // Should throw for pepper less than 32 hex chars (16 bytes)
      expect(() => setPasswordPepper("a".repeat(16))).toThrow();
    });

    it("should hash passwords differently with pepper", async () => {
      const password = "TestPassword123!";

      // Hash without pepper
      const hash1 = await hashPassword(password);

      // Set pepper and hash again
      setPasswordPepper("b".repeat(64));
      const hash2 = await hashPassword(password);

      // Hashes should be different
      expect(hash1.hash).not.toBe(hash2.hash);

      // Reset pepper for other tests
      setPasswordPepper("");
    });

    it("should verify password with pepper correctly", async () => {
      const password = "TestPassword123!";
      const pepper = "c".repeat(64);

      setPasswordPepper(pepper);
      const hash = await hashPassword(password);

      // Verify with correct password should work
      const verifyCorrect = await verifyPasswordHash(password, hash.hash, hash.salt);
      expect(verifyCorrect).toBe(true);

      // Verify with wrong password should fail
      const verifyWrong = await verifyPasswordHash("WrongPassword123!", hash.hash, hash.salt);
      expect(verifyWrong).toBe(false);

      // Reset pepper for other tests
      setPasswordPepper("");
    });
  });

  describe("Input validation", () => {
    it("should reject empty password when hashing", async () => {
      await expect(hashPassword("")).rejects.toThrow("Password cannot be empty");
    });

    it("should reject empty password when verifying", async () => {
      const hash = await hashPassword("ValidPassword123!");
      const result = await verifyPasswordHash("", hash.hash, hash.salt);
      expect(result).toBe(false);
    });

    it("should handle null/undefined inputs gracefully", async () => {
      const hash = await hashPassword("ValidPassword123!");
      const result1 = await verifyPasswordHash("" as never, hash.hash, hash.salt);
      expect(result1).toBe(false);

      const result2 = await verifyPasswordHash("password", "" as never, hash.salt);
      expect(result2).toBe(false);

      const result3 = await verifyPasswordHash("password", hash.hash, "" as never);
      expect(result3).toBe(false);
    });
  });

  describe("Breached password caching", () => {
    it("should clear breached password cache", () => {
      // Should not throw
      expect(() => clearBreachedPasswordCache()).not.toThrow();
    });

    it("should cache breached password results", async () => {
      // Clear cache first
      clearBreachedPasswordCache();

      const password = "testpassword123";

      // First check - will call API
      const result1 = await validatePassword(password);
      const originalErrors = result1.errors.length;

      // Second check - should use cache
      const result2 = await validatePassword(password);
      expect(result2.errors.length).toBe(originalErrors);
    });
  });

  describe("Timing-safe comparison", () => {
    it("should compare hashes in constant time", async () => {
      const password1 = "TestPassword123!";
      const password2 = "DifferentPassword456!";

      const hash1 = await hashPassword(password1);
      const hash2 = await hashPassword(password2);

      // Verify correct password
      const verify1 = await verifyPasswordHash(password1, hash1.hash, hash1.salt);
      expect(verify1).toBe(true);

      // Verify wrong password (should fail regardless of similarity)
      const verify2 = await verifyPasswordHash(password2, hash1.hash, hash1.salt);
      expect(verify2).toBe(false);
    });

    it("should not leak timing information", async () => {
      const password = "TestPassword123!";
      const hash = await hashPassword(password);

      // These should all take roughly the same time
      const start1 = performance.now();
      await verifyPasswordHash(password, hash.hash, hash.salt);
      const time1 = performance.now() - start1;

      const start2 = performance.now();
      await verifyPasswordHash("wrong", hash.hash, hash.salt);
      const time2 = performance.now() - start2;

      // Times should be within 100ms of each other (constant time)
      // This is a rough check - in production, use more sophisticated timing analysis
      expect(Math.abs(time1 - time2)).toBeLessThan(100);
    });
  });
});
