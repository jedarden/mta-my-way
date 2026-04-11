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
 * Enhanced password validation with complexity requirements.
 * Validates password meets all security requirements.
 *
 * Requirements:
 * - Minimum 12 characters, maximum 128 characters
 * - At least one uppercase letter (A-Z)
 * - At least one lowercase letter (a-z)
 * - At least one number (0-9)
 * - At least one special character (!@#$%^&*()_+-=[]{}|;':",.<>/?)
 * - No character repetition more than 3 times in a row
 * - No sequential numbers (1234, 4321, etc.)
 * - No sequential letters (abcd, dcba, etc.)
 * - No keyboard walking patterns (qwerty, asdf, zxcv, etc.)
 * - No common weak passwords (password, admin, welcome, etc.)
 * - No common password variations with numbers (password123, admin1, etc.)
 */
export const passwordComplexitySchema = z
  .string()
  .min(12, "Password must be at least 12 characters long")
  .max(128, "Password must be less than 128 characters")
  .refine((val) => !/<[^>]*>/.test(val), {
    message: "Password cannot contain HTML tags",
  })
  .refine((val) => !/on\w+\s*=/i.test(val), {
    message: "Password cannot contain event handlers",
  })
  .refine((val) => /[A-Z]/.test(val), {
    message: "Password must contain at least one uppercase letter (A-Z)",
  })
  .refine((val) => /[a-z]/.test(val), {
    message: "Password must contain at least one lowercase letter (a-z)",
  })
  .refine((val) => /\d/.test(val), {
    message: "Password must contain at least one number (0-9)",
  })
  .refine((val) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(val), {
    message:
      "Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;':\",.<>/?)",
  })
  .refine((val) => !/(.)\1{3,}/.test(val), {
    message: "Password cannot contain the same character more than 3 times in a row",
  })
  .refine((val) => !/(012|123|234|345|456|567|678|789|890)/.test(val), {
    message: "Password cannot contain sequential numbers (e.g., 1234, 4321)",
  })
  .refine(
    (val) =>
      !/(abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i.test(
        val
      ),
    {
      message: "Password cannot contain sequential letters (e.g., abcd, dcba)",
    }
  )
  .refine((val) => !/qwerty|asdfgh|zxcvbn|qazwsx|1qaz2wsx/i.test(val), {
    message: "Password cannot contain keyboard patterns (e.g., qwerty, asdf, zxcv)",
  })
  .refine(
    (val) => !/^(password|admin|welcome|login|letmein|monkey|dragon|master|qwerty)$/i.test(val),
    {
      message: "Password is too common or weak",
    }
  )
  .refine((val) => !/^(password|admin|welcome|login)\d+$/i.test(val), {
    message: "Password contains a common pattern with numbers",
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
  newPassword: passwordComplexitySchema,
});

/**
 * Password change schema (for authenticated users).
 * Validates current password and new password.
 */
export const passwordChangeSchema = z.object({
  currentPassword: z
    .string()
    .min(1, "Current password is required")
    .max(128, "Password is too long")
    .refine((val) => !/<[^>]*>/.test(val), {
      message: "Current password cannot contain HTML tags",
    }),
  newPassword: passwordComplexitySchema,
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
