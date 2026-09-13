/**
 * Unit tests for JWT token generation and authentication test helpers.
 */

import { describe, expect, it } from "vitest";

// Imported by package subpath, not relative path, so the smoke test below
// proves the `exports` entry in package.json resolves for real consumers.
import * as jwtHelpersEntry from "@mta-my-way/shared/testing/jwt-helpers";

import {
  ROLE_PERMISSIONS,
  ROLE_SCOPES,
  TEST_JWT_SECRET,
  TEST_TOKEN_TTL_SECONDS,
  type TestUserRole,
  assertJwtAccepted,
  assertJwtClaims,
  assertJwtRejected,
  assertJwtShape,
  assertJwtSignedWith,
  assertTokenActive,
  assertTokenExpired,
  claimsForRole,
  createAuthContextForToken,
  createAuthenticatedRequest,
  createBearerHeaders,
  createBearerToken,
  createExpiredToken,
  createNotYetValidToken,
  createSoonToExpireToken,
  createTestJwt,
  createTokenForExpiry,
  createTokenSet,
  createUserForRole,
  createValidToken,
  decodeTestJwt,
  isTokenExpired,
  roleHasPermission,
  secondsUntilExpiry,
} from "./jwt-helpers";

/** Base64url-encode a value the way a JWT segment is encoded. */
function encodeSegment(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

describe("TEST_JWT_SECRET", () => {
  it("is a non-empty string shared by every default token", () => {
    expect(TEST_JWT_SECRET).toBeTruthy();
    expect(typeof TEST_JWT_SECRET).toBe("string");
  });
});

describe("TEST_TOKEN_TTL_SECONDS", () => {
  it("orders scenarios from valid through expired", () => {
    expect(TEST_TOKEN_TTL_SECONDS.valid).toBeGreaterThan(TEST_TOKEN_TTL_SECONDS.soonToExpire);
    expect(TEST_TOKEN_TTL_SECONDS.soonToExpire).toBeGreaterThan(0);
    expect(TEST_TOKEN_TTL_SECONDS.expired).toBeLessThan(0);
  });
});

describe("createTestJwt", () => {
  it("produces a three-segment token with a decodable header and payload", async () => {
    const jwt = await createTestJwt();

    expect(jwt.token.split(".")).toHaveLength(3);
    assertJwtShape(jwt.token);
    expect(jwt.secret).toBe(TEST_JWT_SECRET);
  });

  it("defaults to HS256 with an hour of validity", async () => {
    const jwt = await createTestJwt();

    expect(jwt.header.alg).toBe("HS256");
    expect(jwt.header.typ).toBe("JWT");
    expect(jwt.payload.exp).toBe((jwt.payload.iat as number) + TEST_TOKEN_TTL_SECONDS.valid);
    expect(jwt.expiresAtMs).toBe((jwt.payload.exp as number) * 1000);
  });

  it("defaults the subject and mints a unique id per call", async () => {
    const first = await createTestJwt();
    const second = await createTestJwt();

    expect(first.payload.sub).toBe("user-test-1");
    expect(first.payload.jti).not.toBe(second.payload.jti);
  });

  it("carries every claim it is given", async () => {
    const iat = 1_700_000_000;
    const jwt = await createTestJwt({
      subject: "user-42",
      issuer: "https://mts.example.com",
      audience: "mta-api",
      jwtId: "fixed-id",
      issuedAt: iat,
      notBefore: iat - 10,
      expiresAt: iat + 60,
      kid: "key-1",
    });

    expect(jwt.payload).toMatchObject({
      sub: "user-42",
      iss: "https://mts.example.com",
      aud: "mta-api",
      jti: "fixed-id",
      iat,
      nbf: iat - 10,
      exp: iat + 60,
    });
    expect(jwt.header.kid).toBe("key-1");
  });

  it("accepts an array audience and custom claims", async () => {
    const jwt = await createTestJwt({
      audience: ["api-a", "api-b"],
      claims: { scope: "read:arrivals", deviceId: "device-9" },
    });

    expect(jwt.payload.aud).toEqual(["api-a", "api-b"]);
    expect(jwt.payload.scope).toBe("read:arrivals");
    expect(jwt.payload.deviceId).toBe("device-9");
  });

  it("derives expiry from expiresInSeconds counted from issuedAt", async () => {
    const iat = 1_700_000_000;
    const jwt = await createTestJwt({ issuedAt: iat, expiresInSeconds: 90 });

    expect(jwt.payload.exp).toBe(iat + 90);
  });

  it("prefers the absolute expiresAt over expiresInSeconds", async () => {
    const iat = 1_700_000_000;
    const jwt = await createTestJwt({ issuedAt: iat, expiresAt: iat + 5, expiresInSeconds: 9999 });

    expect(jwt.payload.exp).toBe(iat + 5);
  });

  it("signs with the caller's secret", async () => {
    const jwt = await createTestJwt({ secret: "another-secret" });

    expect(jwt.secret).toBe("another-secret");
    await assertJwtSignedWith(jwt.token, "another-secret");
  });

  it("produces an empty signature for alg none", async () => {
    const jwt = await createTestJwt({ algorithm: "none" });

    expect(jwt.header.alg).toBe("none");
    expect(jwt.token.endsWith(".")).toBe(true);
  });

  it("is verifiable against its own signature", async () => {
    const jwt = await createTestJwt();

    await expect(assertJwtSignedWith(jwt.token, jwt.secret)).resolves.toBeUndefined();
  });
});

describe("createTokenForExpiry", () => {
  it("applies the named scenario's lifetime", async () => {
    const valid = await createTokenForExpiry("valid");
    const soon = await createTokenForExpiry("soonToExpire");
    const expired = await createTokenForExpiry("expired");

    const now = Math.floor(Date.now() / 1000);
    expect((valid.payload.exp as number) - now).toBeGreaterThan(TEST_TOKEN_TTL_SECONDS.valid - 5);
    expect((soon.payload.exp as number) - now).toBeLessThanOrEqual(
      TEST_TOKEN_TTL_SECONDS.soonToExpire
    );
    expect(expired.payload.exp).toBeLessThan(now);
  });

  it("merges scenario timing with the remaining options", async () => {
    const jwt = await createTokenForExpiry("expired", { subject: "user-42" });

    expect(jwt.payload.sub).toBe("user-42");
    expect(jwt.payload.exp).toBeLessThan(Math.floor(Date.now() / 1000));
  });
});

describe("expiry token helpers", () => {
  it("createValidToken returns an active token", async () => {
    const jwt = await createValidToken();

    expect(isTokenExpired(jwt.token)).toBe(false);
  });

  it("createExpiredToken returns an expired token", async () => {
    const jwt = await createExpiredToken();

    expect(isTokenExpired(jwt.token)).toBe(true);
    expect(isTokenExpired(jwt.token, 60)).toBe(true);
  });

  it("createSoonToExpireToken returns a token inside a minute of expiring", async () => {
    const jwt = await createSoonToExpireToken();

    expect(isTokenExpired(jwt.token)).toBe(false);
    expect(secondsUntilExpiry(jwt.token)).toBeLessThanOrEqual(TEST_TOKEN_TTL_SECONDS.soonToExpire);
    expect(secondsUntilExpiry(jwt.token)).toBeGreaterThan(0);
  });

  it("createNotYetValidToken sets a future nbf", async () => {
    const jwt = await createNotYetValidToken();

    expect(jwt.payload.nbf).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(isTokenExpired(jwt.token)).toBe(false);
  });
});

describe("createTokenSet", () => {
  it("builds one token per scenario", async () => {
    const set = await createTokenSet({ subject: "user-42" });

    expect(Object.keys(set).sort()).toEqual(["expired", "soonToExpire", "valid"]);
    expect(isTokenExpired(set.valid.token)).toBe(false);
    expect(isTokenExpired(set.soonToExpire.token)).toBe(false);
    expect(isTokenExpired(set.expired.token)).toBe(true);
    expect(set.valid.payload.sub).toBe("user-42");
  });
});

describe("decodeTestJwt", () => {
  it("round-trips the header and payload", async () => {
    const jwt = await createTestJwt({ subject: "user-42" });
    const decoded = decodeTestJwt(jwt.token);

    expect(decoded?.header.alg).toBe("HS256");
    expect(decoded?.payload.sub).toBe("user-42");
    expect(decoded?.payload.jti).toBe(jwt.payload.jti);
  });

  it("returns null for malformed tokens", () => {
    expect(decodeTestJwt("")).toBeNull();
    expect(decodeTestJwt("only.two")).toBeNull();
    expect(decodeTestJwt("a.b.c.d")).toBeNull();
    expect(decodeTestJwt("!!!.!!!.!!!")).toBeNull();
  });
});

describe("isTokenExpired", () => {
  it("treats a token without exp as unexpired", async () => {
    const jwt = await createTestJwt();
    // Re-encode the payload without `exp`, keeping the original header and
    // signature segments — `isTokenExpired` decodes rather than verifies, so
    // the swap is enough to hand it a token with no expiry at all.
    const [headerSegment, , signature] = jwt.token.split(".");
    const withoutExp: Record<string, unknown> = { ...(decodeTestJwt(jwt.token)?.payload ?? {}) };
    delete withoutExp.exp;
    const stripped = `${headerSegment}.${encodeSegment(withoutExp)}.${signature}`;

    expect(stripped).not.toBe(jwt.token);
    expect(isTokenExpired(stripped)).toBe(false);
    expect(secondsUntilExpiry(stripped)).toBeNull();
  });

  it("applies clock skew in the validator's favour", async () => {
    const jwt = await createExpiredToken();

    expect(isTokenExpired(jwt.token, 0)).toBe(true);
    expect(isTokenExpired(jwt.token, TEST_TOKEN_TTL_SECONDS.valid + 60)).toBe(false);
  });
});

describe("secondsUntilExpiry", () => {
  it("is negative for expired tokens", async () => {
    expect(secondsUntilExpiry((await createExpiredToken()).token)).toBeLessThan(0);
  });

  it("is null when the token does not decode", () => {
    expect(secondsUntilExpiry("not-a-token")).toBeNull();
  });
});

describe("createBearerToken", () => {
  it("prefixes a bare token and leaves a prefixed one alone", () => {
    expect(createBearerToken("abc.def.ghi")).toBe("Bearer abc.def.ghi");
    expect(createBearerToken("Bearer abc.def.ghi")).toBe("Bearer abc.def.ghi");
  });
});

describe("createBearerHeaders", () => {
  it("sets the authorization header", async () => {
    const jwt = await createValidToken();

    expect(createBearerHeaders(jwt.token).get("authorization")).toBe(`Bearer ${jwt.token}`);
  });
});

describe("createAuthenticatedRequest", () => {
  it("sends the given token as a bearer header", async () => {
    const jwt = await createValidToken();
    const request = await createAuthenticatedRequest({ token: jwt.token });

    expect(request).toBeInstanceOf(Request);
    expect(request.method).toBe("GET");
    expect(request.headers.get("authorization")).toBe(`Bearer ${jwt.token}`);
  });

  it("mints a fresh token when none is given", async () => {
    const request = await createAuthenticatedRequest();

    expect(request.headers.get("authorization")).toMatch(/^Bearer .+\..+\..+$/);
  });

  it("carries method, url, extra headers and a JSON body", async () => {
    const request = await createAuthenticatedRequest({
      method: "POST",
      url: "http://localhost:3001/api/favorites",
      headers: { "x-trace": "trace-1" },
      body: { stationId: "725" },
    });

    expect(request.method).toBe("POST");
    expect(request.url).toBe("http://localhost:3001/api/favorites");
    expect(request.headers.get("x-trace")).toBe("trace-1");
    expect(request.headers.get("content-type")).toBe("application/json");
    await expect(request.json()).resolves.toEqual({ stationId: "725" });
  });
});

describe("createAuthContextForToken", () => {
  it("derives an auth context from the token identity", async () => {
    const jwt = await createTestJwt();
    const auth = createAuthContextForToken(jwt);

    expect(auth.keyId).toBe(`key-${jwt.payload.jti}`);
    expect(auth.sessionId).toBe(`session-${jwt.payload.jti}`);
    expect(auth.scope).toBe("read");
    expect(auth.authMethod).toBe("session");
  });

  it("adopts the role the token carries", async () => {
    const jwt = await createTestJwt({ claims: claimsForRole("admin") });
    const auth = createAuthContextForToken(jwt);

    expect(auth.role).toBe("admin");
    expect(auth.roles).toEqual(["admin"]);
    expect(auth.scope).toBe("admin");
  });

  it("lets overrides win over derived values", async () => {
    const jwt = await createTestJwt({ claims: claimsForRole("admin") });
    const auth = createAuthContextForToken(jwt, { scope: "read", authMethod: "oauth" });

    expect(auth.scope).toBe("read");
    expect(auth.authMethod).toBe("oauth");
  });
});

describe("ROLE_PERMISSIONS", () => {
  it("covers every role with a non-empty grant list", () => {
    const roles = Object.keys(ROLE_PERMISSIONS) as TestUserRole[];

    expect(roles.length).toBeGreaterThan(0);
    for (const role of roles) {
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
  });

  it("grants admin everything and guests only reads", () => {
    expect(ROLE_PERMISSIONS.admin).toEqual(["*"]);
    expect(
      ROLE_PERMISSIONS.guest.every(
        (permission) => permission.startsWith("read") || permission.endsWith(":read")
      )
    ).toBe(true);
  });
});

describe("ROLE_SCOPES", () => {
  it("gives admin the widest scope", () => {
    expect(ROLE_SCOPES.admin).toBe("admin");
    expect(ROLE_SCOPES.service).toBe("write");
    expect(ROLE_SCOPES.user).toBe("read");
  });
});

describe("claimsForRole", () => {
  it("carries the role, its roles list and its permissions", () => {
    const claims = claimsForRole("readonly");

    expect(claims.role).toBe("readonly");
    expect(claims.roles).toEqual(["readonly"]);
    expect(claims.permissions).toEqual([...ROLE_PERMISSIONS.readonly]);
  });

  it("merges extra claims over the role claims", () => {
    const claims = claimsForRole("user", { deviceId: "device-9" });

    expect(claims.deviceId).toBe("device-9");
    expect(claims.role).toBe("user");
  });
});

describe("createUserForRole", () => {
  it("builds a user holding the role and its permissions", () => {
    const user = createUserForRole("admin");

    expect(user.role).toBe("admin");
    expect(user.roles).toEqual(["admin"]);
    expect(user.permissions).toEqual(["*"]);
    expect(user.active).toBe(true);
  });

  it("maps fixture-only roles onto a server role while keeping them in roles", () => {
    const user = createUserForRole("service");

    expect(user.role).toBe("user");
    expect(user.roles).toEqual(["service"]);
    expect(user.permissions).toEqual([...ROLE_PERMISSIONS.service]);
  });

  it("applies overrides last", () => {
    const user = createUserForRole("user", { id: "user-42", permissions: ["trips:read:own"] });

    expect(user.id).toBe("user-42");
    expect(user.permissions).toEqual(["trips:read:own"]);
  });
});

describe("roleHasPermission", () => {
  it("matches exact grants", () => {
    expect(roleHasPermission("user", "trips:read:own")).toBe(true);
    expect(roleHasPermission("user", "admin:users:create")).toBe(false);
  });

  it("honours the full wildcard for admin", () => {
    expect(roleHasPermission("admin", "admin:users:create")).toBe(true);
  });

  it("honours prefix wildcards", () => {
    expect(roleHasPermission("service", "trips:read")).toBe(true);
    expect(roleHasPermission("service", "trips:create")).toBe(false);
  });
});

describe("assertJwtShape", () => {
  it("accepts a generated token", async () => {
    const jwt = await createTestJwt();

    expect(() => assertJwtShape(jwt.token)).not.toThrow();
  });

  it("rejects values that are not decodable JWTs", async () => {
    expect(() => assertJwtShape("not-a-token")).toThrow(/decodable JWT/);
    expect(() => assertJwtShape("a.b")).toThrow(/decodable JWT/);
  });
});

describe("assertJwtClaims", () => {
  it("passes when every expected claim matches", async () => {
    const jwt = await createTestJwt({ subject: "user-42", claims: { role: "admin" } });

    expect(() => assertJwtClaims(jwt.token, { sub: "user-42", role: "admin" })).not.toThrow();
  });

  it("reports every mismatched and missing claim", async () => {
    const jwt = await createTestJwt({ subject: "user-42" });

    expect(() => assertJwtClaims(jwt.token, { sub: "other", absent: "x" })).toThrow(/sub:|absent:/);
  });

  it("compares array claims deeply", async () => {
    const jwt = await createTestJwt({ audience: ["api-a", "api-b"] });

    expect(() => assertJwtClaims(jwt.token, { aud: ["api-a", "api-b"] })).not.toThrow();
    expect(() => assertJwtClaims(jwt.token, { aud: ["api-b", "api-a"] })).toThrow(/aud:/);
  });

  it("refuses a token that does not decode", () => {
    expect(() => assertJwtClaims("nope", { sub: "x" })).toThrow(/does not decode/);
  });
});

describe("assertTokenExpired and assertTokenActive", () => {
  it("accepts an expired token as expired", async () => {
    const jwt = await createExpiredToken();

    expect(() => assertTokenExpired(jwt.token)).not.toThrow();
    expect(() => assertTokenActive(jwt.token)).toThrow(/expired at/);
  });

  it("accepts a valid token as active", async () => {
    const jwt = await createValidToken();

    expect(() => assertTokenActive(jwt.token)).not.toThrow();
    expect(() => assertTokenExpired(jwt.token)).toThrow(/valid for/);
  });

  it("respects clock skew", async () => {
    const jwt = await createExpiredToken();

    expect(() => assertTokenActive(jwt.token, TEST_TOKEN_TTL_SECONDS.valid + 120)).not.toThrow();
  });
});

describe("assertJwtSignedWith", () => {
  it("verifies the correct secret", async () => {
    const jwt = await createTestJwt({ secret: "secret-a" });

    await expect(assertJwtSignedWith(jwt.token, "secret-a")).resolves.toBeUndefined();
  });

  it("rejects a different secret", async () => {
    const jwt = await createTestJwt({ secret: "secret-a" });

    await expect(assertJwtSignedWith(jwt.token, "secret-b")).rejects.toThrow(/did not verify/);
  });

  it("accepts an empty signature for an unsigned token", async () => {
    const jwt = await createTestJwt({ algorithm: "none" });

    await expect(assertJwtSignedWith(jwt.token, TEST_JWT_SECRET)).resolves.toBeUndefined();
  });

  it("refuses a token that does not decode", async () => {
    await expect(assertJwtSignedWith("nope", TEST_JWT_SECRET)).rejects.toThrow(/does not decode/);
  });
});

describe("assertJwtRejected and assertJwtAccepted", () => {
  it("accepts a rejection with a matching code", () => {
    expect(() =>
      assertJwtRejected(
        { valid: false, error: "Token expired", errorCode: "TOKEN_EXPIRED" },
        "TOKEN_EXPIRED"
      )
    ).not.toThrow();
  });

  it("rejects an accepted result", () => {
    expect(() => assertJwtRejected({ valid: true })).toThrow(/accepted it/);
  });

  it("reports a code mismatch", () => {
    expect(() =>
      assertJwtRejected({ valid: false, errorCode: "INVALID_SIGNATURE" }, "TOKEN_EXPIRED")
    ).toThrow(/INVALID_SIGNATURE/);
  });

  it("assertJwtAccepted passes on a valid result and fails on a rejection", () => {
    expect(() => assertJwtAccepted({ valid: true })).not.toThrow();
    expect(() => assertJwtAccepted({ valid: false, errorCode: "TOKEN_EXPIRED" })).toThrow(
      /TOKEN_EXPIRED/
    );
  });
});

describe("package entry point", () => {
  it("exposes the helpers through the package subpath", () => {
    expect(typeof jwtHelpersEntry.createTestJwt).toBe("function");
    expect(typeof jwtHelpersEntry.createValidToken).toBe("function");
    expect(typeof jwtHelpersEntry.createAuthenticatedRequest).toBe("function");
    expect(typeof jwtHelpersEntry.createAuthContextForToken).toBe("function");
    expect(typeof jwtHelpersEntry.createUserForRole).toBe("function");
    expect(typeof jwtHelpersEntry.roleHasPermission).toBe("function");
    expect(typeof jwtHelpersEntry.assertJwtShape).toBe("function");
    expect(jwtHelpersEntry.DEFAULT_JWT_SUBJECT).toBe("user-test-1");
  });

  it("composes a token, request and context for one user", async () => {
    const jwt = await jwtHelpersEntry.createValidToken({
      claims: jwtHelpersEntry.claimsForRole("admin"),
    });
    const request = await jwtHelpersEntry.createAuthenticatedRequest({ token: jwt.token });
    const context = jwtHelpersEntry.createAuthContextForToken(jwt);

    expect(request.headers.get("authorization")).toBe(`Bearer ${jwt.token}`);
    expect(context.role).toBe("admin");
    expect(jwtHelpersEntry.roleHasPermission("admin", "admin:users:create")).toBe(true);
  });
});
