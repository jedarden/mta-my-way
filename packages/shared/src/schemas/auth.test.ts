/**
 * Tests for auth.ts schemas
 *
 * Tests Zod validation schemas for authentication and password reset including:
 * - Password reset request validation
 * - Password complexity requirements
 * - Password reset confirmation validation
 * - Password change validation
 * - Password policy schema
 */

import { describe, expect, it } from "vitest";
import {
  passwordChangeSchema,
  passwordComplexitySchema,
  passwordPolicySchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from "./auth";

describe("passwordResetRequestSchema", () => {
  describe("valid email addresses", () => {
    it("accepts valid email address", () => {
      const result = passwordResetRequestSchema.safeParse({
        email: "user@example.com",
      });
      expect(result.success).toBe(true);
    });

    it("accepts email with subdomains", () => {
      const result = passwordResetRequestSchema.safeParse({
        email: "user@mail.example.com",
      });
      expect(result.success).toBe(true);
    });

    it("accepts email with numbers", () => {
      const result = passwordResetRequestSchema.safeParse({
        email: "user123@example.com",
      });
      expect(result.success).toBe(true);
    });

    it("converts email to lowercase", () => {
      const result = passwordResetRequestSchema.safeParse({
        email: "USER@EXAMPLE.COM",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("user@example.com");
      }
    });
  });

  describe("invalid email addresses", () => {
    it("rejects missing email", () => {
      const result = passwordResetRequestSchema.safeParse({
        email: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Email is required");
      }
    });

    it("rejects invalid email format", () => {
      const result = passwordResetRequestSchema.safeParse({
        email: "not-an-email",
      });
      expect(result.success).toBe(false);
    });

    it("rejects email with HTML tags", () => {
      const result = passwordResetRequestSchema.safeParse({
        email: "user<script>@example.com",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("HTML");
      }
    });

    it("rejects email with event handlers", () => {
      const result = passwordResetRequestSchema.safeParse({
        email: "useronload=@example.com",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("event");
      }
    });

    it("rejects overly long email", () => {
      const result = passwordResetRequestSchema.safeParse({
        email: `${"a".repeat(250)}@example.com`,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("too long");
      }
    });
  });
});

describe("passwordComplexitySchema", () => {
  describe("valid passwords", () => {
    it("accepts password with all requirements", () => {
      const result = passwordComplexitySchema.safeParse("SecureP@ssw0rd9");
      expect(result.success).toBe(true);
    });

    it("accepts password with special characters", () => {
      const result = passwordComplexitySchema.safeParse("MyP@ssword!97");
      expect(result.success).toBe(true);
    });

    it("accepts password with spaces (not explicitly forbidden)", () => {
      const result = passwordComplexitySchema.safeParse("My Passw0rd! 9");
      expect(result.success).toBe(true);
    });
  });

  describe("length requirements", () => {
    it("rejects password shorter than 12 characters", () => {
      const result = passwordComplexitySchema.safeParse("Short1!");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((e) => e.message.includes("12"))).toBe(true);
      }
    });

    it("rejects password longer than 128 characters", () => {
      const result = passwordComplexitySchema.safeParse(`${"a".repeat(130)}1!A`);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((e) => e.message.includes("128"))).toBe(true);
      }
    });

    it("accepts password exactly 12 characters", () => {
      const result = passwordComplexitySchema.safeParse("12CharsOk!99");
      expect(result.success).toBe(true);
    });
  });

  describe("character type requirements", () => {
    it("rejects password without uppercase", () => {
      const result = passwordComplexitySchema.safeParse("lowercase1!");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((e) => e.message.includes("uppercase"))).toBe(true);
      }
    });

    it("rejects password without lowercase", () => {
      const result = passwordComplexitySchema.safeParse("UPPERCASE1!");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((e) => e.message.includes("lowercase"))).toBe(true);
      }
    });

    it("rejects password without numbers", () => {
      const result = passwordComplexitySchema.safeParse("NoNumbers!!");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((e) => e.message.includes("number"))).toBe(true);
      }
    });

    it("rejects password without special characters", () => {
      const result = passwordComplexitySchema.safeParse("NoSpecialChars123");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((e) => e.message.includes("special"))).toBe(true);
      }
    });
  });

  describe("pattern restrictions", () => {
    it("rejects password with repeated characters (4+ in a row)", () => {
      const result = passwordComplexitySchema.safeParse("aaaaAAAA1!");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((e) => e.message.includes("same character"))).toBe(true);
      }
    });

    it("rejects password with sequential numbers", () => {
      const result = passwordComplexitySchema.safeParse("Pass5678word!");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((e) => e.message.includes("sequential"))).toBe(true);
      }
    });

    it("rejects password with sequential letters", () => {
      const result = passwordComplexitySchema.safeParse("Passabcd123!");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((e) => e.message.includes("sequential letters"))).toBe(
          true
        );
      }
    });

    it("rejects password with keyboard patterns", () => {
      const result = passwordComplexitySchema.safeParse("qwertyUIOP123!");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((e) => e.message.includes("keyboard"))).toBe(true);
      }
    });
  });

  describe("common password restrictions", () => {
    it("rejects common weak passwords", () => {
      const commonPasswords = [
        "password",
        "admin",
        "welcome",
        "login",
        "letmein",
        "monkey",
        "dragon",
        "master",
        "qwerty",
      ];

      for (const pwd of commonPasswords) {
        const result = passwordComplexitySchema.safeParse(`${pwd}123!A`);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(
            result.error.issues.some(
              (e) => e.message.includes("weak") || e.message.includes("common")
            )
          ).toBe(true);
        }
      }
    });

    it("rejects common passwords with numbers", () => {
      const result = passwordComplexitySchema.safeParse("password12345!");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((e) => e.message.includes("pattern"))).toBe(true);
      }
    });
  });

  describe("security input validation", () => {
    it("rejects password with HTML tags", () => {
      const result = passwordComplexitySchema.safeParse("Password<script>1!A");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((e) => e.message.includes("HTML"))).toBe(true);
      }
    });

    it("rejects password with event handlers", () => {
      const result = passwordComplexitySchema.safeParse("Passwordonerror=1!A");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((e) => e.message.includes("event"))).toBe(true);
      }
    });
  });
});

describe("passwordResetConfirmSchema", () => {
  it("accepts valid reset confirmation", () => {
    const result = passwordResetConfirmSchema.safeParse({
      tokenId: "valid-token-123",
      token: "valid-reset-token",
      newPassword: "SecureP@ssw0rd9",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing tokenId", () => {
    const result = passwordResetConfirmSchema.safeParse({
      tokenId: "",
      token: "valid-token",
      newPassword: "SecureP@ssw0rd9",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing token", () => {
    const result = passwordResetConfirmSchema.safeParse({
      tokenId: "valid-token-123",
      token: "",
      newPassword: "SecureP@ssw0rd9",
    });
    expect(result.success).toBe(false);
  });

  it("applies password complexity to newPassword", () => {
    const result = passwordResetConfirmSchema.safeParse({
      tokenId: "valid-token-123",
      token: "valid-token",
      newPassword: "weak",
    });
    expect(result.success).toBe(false);
  });

  it("rejects HTML in tokenId", () => {
    const result = passwordResetConfirmSchema.safeParse({
      tokenId: "<script>alert(1)</script>",
      token: "valid-token",
      newPassword: "SecureP@ssw0rd9",
    });
    expect(result.success).toBe(false);
  });

  it("rejects HTML in token", () => {
    const result = passwordResetConfirmSchema.safeParse({
      tokenId: "valid-token-123",
      token: "<img src=x onerror=alert(1)>",
      newPassword: "SecureP@ssw0rd9",
    });
    expect(result.success).toBe(false);
  });
});

describe("passwordChangeSchema", () => {
  it("accepts valid password change", () => {
    const result = passwordChangeSchema.safeParse({
      currentPassword: "OldP@ssw0rd9",
      newPassword: "NewP@ssw0rd8",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing currentPassword", () => {
    const result = passwordChangeSchema.safeParse({
      currentPassword: "",
      newPassword: "NewP@ssw0rd8",
    });
    expect(result.success).toBe(false);
  });

  it("applies password complexity to newPassword", () => {
    const result = passwordChangeSchema.safeParse({
      currentPassword: "OldP@ssw0rd9",
      newPassword: "weak",
    });
    expect(result.success).toBe(false);
  });

  it("rejects HTML in currentPassword", () => {
    const result = passwordChangeSchema.safeParse({
      currentPassword: "<script>alert(1)</script>",
      newPassword: "NewP@ssw0rd8",
    });
    expect(result.success).toBe(false);
  });
});

describe("passwordPolicySchema", () => {
  it("accepts valid password policy", () => {
    const result = passwordPolicySchema.safeParse({
      minLength: 12,
      maxLength: 128,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      allowSpaces: false,
      expirationDays: 90,
      historyCount: 5,
    });
    expect(result.success).toBe(true);
  });

  it("accepts policy with spaces allowed", () => {
    const result = passwordPolicySchema.safeParse({
      minLength: 12,
      maxLength: 128,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      allowSpaces: true,
      expirationDays: 90,
      historyCount: 5,
    });
    expect(result.success).toBe(true);
  });

  it("accepts policy with no expiration", () => {
    const result = passwordPolicySchema.safeParse({
      minLength: 12,
      maxLength: 128,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      allowSpaces: false,
      expirationDays: 0,
      historyCount: 5,
    });
    expect(result.success).toBe(true);
  });

  it("accepts policy with no history requirement", () => {
    const result = passwordPolicySchema.safeParse({
      minLength: 12,
      maxLength: 128,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      allowSpaces: false,
      expirationDays: 90,
      historyCount: 0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts minimal policy", () => {
    const result = passwordPolicySchema.safeParse({
      minLength: 8,
      maxLength: 64,
      requireUppercase: false,
      requireLowercase: false,
      requireNumbers: false,
      requireSpecialChars: false,
      allowSpaces: true,
      expirationDays: 0,
      historyCount: 0,
    });
    expect(result.success).toBe(true);
  });
});
