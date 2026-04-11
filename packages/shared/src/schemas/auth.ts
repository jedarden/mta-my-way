/**
 * Zod validation schemas for authentication and password reset.
 * Shared between server and frontend for consistent validation.
 */

import { z } from "zod";

/**
 * Password reset request schema.
 * Validates the request to initiate a password reset.
 */
export const passwordResetRequestSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .max(254, "Email is too long")
    .email("Invalid email format")
    .refine((val) => !/<[^>]*>/.test(val), {
      message: "Email cannot contain HTML tags",
    })
    .refine((val) => !/on\w+\s*=/i.test(val), {
      message: "Email cannot contain event handlers",
    })
    .toLowerCase(),
});

/**
 * Password reset confirmation schema.
 * Validates the password reset token and new password.
 */
export const passwordResetConfirmSchema = z.object({
  tokenId: z
    .string()
    .min(1, "Token ID is required")
    .max(100, "Token ID is too long")
    .refine((val) => !/<[^>]*>/.test(val), {
      message: "Token ID cannot contain HTML tags",
    }),
  token: z
    .string()
    .min(1, "Token is required")
    .max(128, "Token is too long")
    .refine((val) => !/<[^>]*>/.test(val), {
      message: "Token cannot contain HTML tags",
    }),
  newPassword: z
    .string()
    .min(12, "Password must be at least 12 characters long")
    .max(128, "Password must be less than 128 characters")
    .refine((val) => !/<[^>]*>/.test(val), {
      message: "Password cannot contain HTML tags",
    }),
});

/**
 * Password change schema (for authenticated users).
 * Validates current password and new password.
 */
export const passwordChangeSchema = z.object({
  currentPassword: z
    .string()
    .min(1, "Current password is required")
    .max(128, "Password is too long"),
  newPassword: z
    .string()
    .min(12, "Password must be at least 12 characters long")
    .max(128, "Password must be less than 128 characters")
    .refine((val) => !/<[^>]*>/.test(val), {
      message: "Password cannot contain HTML tags",
    }),
});

/**
 * Password policy response schema.
 * Describes the current password policy requirements.
 */
export const passwordPolicySchema = z.object({
  minLength: z.number(),
  maxLength: z.number(),
  requireUppercase: z.boolean(),
  requireLowercase: z.boolean(),
  requireNumbers: z.boolean(),
  requireSpecialChars: z.boolean(),
  allowSpaces: z.boolean(),
  expirationDays: z.number(),
  historyCount: z.number(),
});
