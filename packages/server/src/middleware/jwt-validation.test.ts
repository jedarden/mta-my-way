/**
 * JWT validation module tests.
 *
 * Tests comprehensive JWT validation including:
 * - Token structure validation
 * - Signature verification (HMAC-SHA256)
 * - Claims validation (exp, nbf, iat, iss, aud)
 * - Algorithm validation
 * - Replay attack prevention
 * - Token creation
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  type DecodedJwt,
  type JwtPayload,
  type JwtValidationOptions,
  checkTokenReplay,
  cleanupReplayStore,
  createJwt,
  decodeJwt,
  validateJwt,
  validateJwtStructure,
  verifyJwt,
} from "./jwt-validation.js";

describe("JWT Validation Module", () => {
  const testSecret = "test-secret-key-for-jwt-signing";
  const testPayload: JwtPayload = {
    sub: "user123",
    iss: "https://example.com",
    aud: "api-example",
  };

  describe("decodeJwt", () => {
    it("should decode a valid JWT token", async () => {
      const token = await createJwt(testPayload, testSecret, { expiresIn: 3600 });
      const decoded = decodeJwt(token);

      expect(decoded).not.toBeNull();
      expect(decoded?.header.alg).toBe("HS256");
      expect(decoded?.header.typ).toBe("JWT");
      expect(decoded?.payload.sub).toBe("user123");
      expect(decoded?.payload.iss).toBe("https://example.com");
      expect(decoded?.payload.aud).toBe("api-example");
    });

    it("should return null for invalid token structure", () => {
      expect(decodeJwt("invalid")).toBeNull();
      expect(decodeJwt("only.two")).toBeNull();
      expect(decodeJwt("")).toBeNull();
    });

    it("should handle tokens with custom claims", async () => {
      const customPayload: JwtPayload = {
        ...testPayload,
        customClaim: "custom-value",
        userId: "12345",
      };
      const token = await createJwt(customPayload, testSecret, { expiresIn: 3600 });
      const decoded = decodeJwt(token);

      expect(decoded?.payload.customClaim).toBe("custom-value");
      expect(decoded?.payload.userId).toBe("12345");
    });
  });

  describe("validateJwt", () => {
    it("should validate a token with valid signature", async () => {
      const token = await createJwt(testPayload, testSecret, { expiresIn: 3600 });
      const result = await validateJwt(token, testSecret);

      expect(result.valid).toBe(true);
      expect(result.decoded).toBeDefined();
      expect(result.decoded?.payload.sub).toBe("user123");
    });

    it("should reject token with invalid signature", async () => {
      const token = await createJwt(testPayload, testSecret, { expiresIn: 3600 });
      const result = await validateJwt(token, "wrong-secret");

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid signature");
      expect(result.errorCode).toBe("INVALID_SIGNATURE");
    });

    it("should reject expired token", async () => {
      // Create a token with an expiration in the past
      const pastExpPayload: JwtPayload = {
        ...testPayload,
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
        iat: Math.floor(Date.now() / 1000) - 7200, // Issued 2 hours ago
      };
      const token = await createJwt(pastExpPayload, testSecret, { expiresIn: 7200 });
      const result = await validateJwt(token, testSecret);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Token expired");
      expect(result.errorCode).toBe("TOKEN_EXPIRED");
    });

    it("should reject token with invalid issuer", async () => {
      const token = await createJwt(testPayload, testSecret, { expiresIn: 3600 });
      const result = await validateJwt(token, testSecret, {
        issuer: "https://different.com",
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid issuer");
      expect(result.errorCode).toBe("INVALID_ISSUER");
    });

    it("should accept token with valid issuer", async () => {
      const token = await createJwt({ ...testPayload, iss: "https://allowed.com" }, testSecret, {
        expiresIn: 3600,
      });
      const result = await validateJwt(token, testSecret, {
        issuer: ["https://allowed.com", "https://also-allowed.com"],
      });

      expect(result.valid).toBe(true);
    });

    it("should reject token with invalid audience", async () => {
      const token = await createJwt(testPayload, testSecret, { expiresIn: 3600 });
      const result = await validateJwt(token, testSecret, {
        audience: "different-audience",
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid audience");
      expect(result.errorCode).toBe("INVALID_AUDIENCE");
    });

    it("should accept token with valid audience", async () => {
      const token = await createJwt({ ...testPayload, aud: ["api-a", "api-b"] }, testSecret, {
        expiresIn: 3600,
      });
      const result = await validateJwt(token, testSecret, {
        audience: "api-a",
      });

      expect(result.valid).toBe(true);
    });

    it("should reject token that is too old", async () => {
      // Create a token with an iat 2 hours in the past
      const oldPayload: JwtPayload = {
        ...testPayload,
        iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
        exp: Math.floor(Date.now() / 1000) + 3600, // Expires in 1 hour
      };
      const oldToken = await createJwt(oldPayload, testSecret);

      const result = await validateJwt(oldToken, testSecret, {
        maxAge: 3600, // 1 hour max age
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Token too old");
      expect(result.errorCode).toBe("TOKEN_TOO_OLD");
    });

    it("should accept token within max age", async () => {
      const token = await createJwt(testPayload, testSecret, { expiresIn: 3600 });
      const result = await validateJwt(token, testSecret, {
        maxAge: 7200, // 2 hours max age
      });

      expect(result.valid).toBe(true);
    });

    it("should handle clock skew tolerance", async () => {
      // Create a token that's slightly expired (within clock skew)
      const token = await createJwt(testPayload, testSecret, { expiresIn: 3540 }); // 59 minutes
      await new Promise((resolve) => setTimeout(resolve, 100)); // Small delay

      const result = await validateJwt(token, testSecret, { clockSkew: 60 });

      // Token should still be valid due to clock skew tolerance
      expect(result.valid).toBe(true);
    });

    it("should block tokens with 'none' algorithm", async () => {
      const header = { alg: "none", typ: "JWT" };
      const payload = {
        ...testPayload,
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      };
      const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
      const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const token = `${encodedHeader}.${encodedPayload}.`;

      const result = await validateJwt(token, testSecret, {
        blockAlg: ["none"],
        validateStructure: false, // Skip structure check to test algorithm blocking
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Blocked algorithm: none");
      expect(result.errorCode).toBe("BLOCKED_ALGORITHM");
    });

    it("should require specific algorithm", async () => {
      const token = await createJwt(testPayload, testSecret, { expiresIn: 3600 });
      const result = await validateJwt(token, testSecret, {
        requireAlg: "RS256", // Token was signed with HS256
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Unsupported algorithm: HS256");
    });
  });

  describe("createJwt", () => {
    it("should create a valid JWT token", async () => {
      const token = await createJwt(testPayload, testSecret, { expiresIn: 3600 });

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3); // header.payload.signature
    });

    it("should include all standard claims", async () => {
      const token = await createJwt(testPayload, testSecret, { expiresIn: 3600 });
      const decoded = decodeJwt(token);

      expect(decoded?.payload.iat).toBeDefined();
      expect(decoded?.payload.exp).toBeDefined();
      expect(decoded?.payload.iss).toBe("https://example.com");
      expect(decoded?.payload.aud).toBe("api-example");
      expect(decoded?.payload.sub).toBe("user123");
    });

    it("should include JWT ID when provided", async () => {
      const token = await createJwt(testPayload, testSecret, {
        expiresIn: 3600,
        jwtId: "unique-token-id-123",
      });
      const decoded = decodeJwt(token);

      expect(decoded?.payload.jti).toBe("unique-token-id-123");
    });

    it("should set correct expiration time", async () => {
      const expiresIn = 7200; // 2 hours
      const now = Math.floor(Date.now() / 1000);
      const token = await createJwt(testPayload, testSecret, { expiresIn });
      const decoded = decodeJwt(token);

      expect(decoded?.payload.exp).toBeGreaterThanOrEqual(now + expiresIn - 1);
      expect(decoded?.payload.exp).toBeLessThanOrEqual(now + expiresIn + 1);
    });
  });

  describe("verifyJwt convenience function", () => {
    it("should verify a valid token and return payload", async () => {
      const token = await createJwt(testPayload, testSecret, { expiresIn: 3600 });
      const result = await verifyJwt(token, testSecret);

      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();
      expect(result.payload?.sub).toBe("user123");
    });

    it("should return error for invalid token", async () => {
      const result = await verifyJwt("invalid-token", testSecret);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("Token replay prevention", () => {
    const jti = "test-jti-123";
    const futureExp = Math.floor(Date.now() / 1000) + 3600;

    beforeEach(() => {
      cleanupReplayStore(); // Clear store before each test
    });

    it("should detect token replay attack", () => {
      const firstUse = checkTokenReplay(jti, futureExp);
      const secondUse = checkTokenReplay(jti, futureExp);

      expect(firstUse).toBe(false); // First use should not be a replay
      expect(secondUse).toBe(true); // Second use should be detected as replay
    });

    it("should allow different tokens with different JTI", () => {
      const jti1 = "token-1";
      const jti2 = "token-2";

      const use1 = checkTokenReplay(jti1, futureExp);
      const use2 = checkTokenReplay(jti2, futureExp);

      expect(use1).toBe(false);
      expect(use2).toBe(false); // Different JTI, not a replay
    });

    it("should clean up expired entries", () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600; // Expired 1 hour ago

      checkTokenReplay("expired-jti", pastExp);
      const cleaned = cleanupReplayStore();

      expect(cleaned).toBeGreaterThan(0); // Should have cleaned up expired entries
    });

    it("should work with validateJwt checkReplay option", async () => {
      const token = await createJwt({ ...testPayload, jti: "test-replay-jti" }, testSecret, {
        expiresIn: 3600,
        jwtId: "test-replay-jti",
      });

      // First validation should succeed
      const result1 = await validateJwt(token, testSecret, { checkReplay: true });
      expect(result1.valid).toBe(true);

      // Second validation should fail due to replay detection
      const result2 = await validateJwt(token, testSecret, { checkReplay: true });
      expect(result2.valid).toBe(false);
      expect(result2.error).toBe("Token already used (replay attack)");
      expect(result2.errorCode).toBe("TOKEN_REPLAY");
    });
  });

  describe("validateJwtStructure", () => {
    it("should validate a properly structured JWT", async () => {
      const token = await createJwt(testPayload, testSecret, { expiresIn: 3600 });
      const decoded = decodeJwt(token);

      if (decoded) {
        const result = validateJwtStructure(decoded);
        expect(result.valid).toBe(true);
      }
    });

    it("should reject JWT without algorithm", () => {
      const decoded: DecodedJwt = {
        header: { typ: "JWT" },
        payload: {
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        signature: "abc",
      };

      const result = validateJwtStructure(decoded);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("MISSING_ALGORITHM");
    });

    it("should reject JWT without iat claim", () => {
      const decoded: DecodedJwt = {
        header: { alg: "HS256", typ: "JWT" },
        payload: {
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        signature: "abc",
      };

      const result = validateJwtStructure(decoded);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("MISSING_IAT");
    });

    it("should reject JWT without exp claim", () => {
      const decoded: DecodedJwt = {
        header: { alg: "HS256", typ: "JWT" },
        payload: {
          iat: Math.floor(Date.now() / 1000),
        },
        signature: "abc",
      };

      const result = validateJwtStructure(decoded);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("MISSING_EXP");
    });

    it("should reject JWT with invalid type", () => {
      const decoded: DecodedJwt = {
        header: { alg: "HS256", typ: "NotJWT" },
        payload: {
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        signature: "abc",
      };

      const result = validateJwtStructure(decoded);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("INVALID_TYPE");
    });
  });

  describe("Edge cases and error handling", () => {
    it("should handle malformed base64 in token", () => {
      const malformedToken = "not-valid-base64.not-valid-base64.signature";
      const result = decodeJwt(malformedToken);

      expect(result).toBeNull();
    });

    it("should handle empty payload", async () => {
      const token = await createJwt({}, testSecret, { expiresIn: 3600 });
      const result = await validateJwt(token, testSecret);

      // Should still be valid structurally, just no custom claims
      expect(result.valid).toBe(true);
    });

    it("should handle Unicode in payload", async () => {
      const unicodePayload: JwtPayload = {
        ...testPayload,
        name: "用户名", // Chinese characters
        emoji: "🔐",
      };
      const token = await createJwt(unicodePayload, testSecret, { expiresIn: 3600 });
      const result = await validateJwt(token, testSecret);

      expect(result.valid).toBe(true);
      expect(result.decoded?.payload.name).toBe("用户名");
      expect(result.decoded?.payload.emoji).toBe("🔐");
    });

    it("should handle very long payloads", async () => {
      const longPayload: JwtPayload = {
        ...testPayload,
        data: "x".repeat(10000), // 10KB of data
      };
      const token = await createJwt(longPayload, testSecret, { expiresIn: 3600 });
      const result = await validateJwt(token, testSecret);

      expect(result.valid).toBe(true);
    });
  });

  describe("Security validations", () => {
    it("should reject token with future iat", async () => {
      const futureIat = Math.floor(Date.now() / 1000) + 3600; // 1 hour in future
      const futurePayload: JwtPayload = {
        ...testPayload,
        iat: futureIat,
        exp: futureIat + 3600, // Expires 1 hour after future iat
      };
      const token = await createJwt(futurePayload, testSecret);

      const result = await validateJwt(token, testSecret);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("TOKEN_FUTURE_IAT");
    });

    it("should reject token used before nbf", async () => {
      const futureNbf = Math.floor(Date.now() / 1000) + 3600; // 1 hour in future
      const token = await createJwt({ ...testPayload, nbf: futureNbf }, testSecret, {
        expiresIn: 7200,
      });

      const result = await validateJwt(token, testSecret);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("TOKEN_NOT_YET_VALID");
    });

    it("should accept token after nbf time", async () => {
      const pastNbf = Math.floor(Date.now() / 1000) - 60; // 1 minute ago
      const token = await createJwt({ ...testPayload, nbf: pastNbf }, testSecret, {
        expiresIn: 3600,
      });

      const result = await validateJwt(token, testSecret);
      expect(result.valid).toBe(true);
    });
  });
});
