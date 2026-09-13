/**
 * JWT token generation and authentication test helpers for MTA My Way.
 *
 * These helpers mint *real* HS256 JWTs — the same `header.payload.signature`
 * base64url shape `packages/server/src/middleware/jwt-validation.ts` validates —
 * so a test exercises the genuine signature, expiry and claims paths instead of
 * stubbing them. {@link createTestJwt} is the general builder; the expiry
 * wrappers ({@link createValidToken}, {@link createExpiredToken},
 * {@link createSoonToExpireToken}, {@link createNotYetValidToken}) are the four
 * claims scenarios a validation test normally wants, named.
 *
 * Context and user builders reuse the types from
 * `middleware/execution-context.ts`, which mirror the server's `AuthContext`
 * and `UserRole`, so a context built here can be handed straight to middleware
 * expecting the server's shapes.
 *
 * Signing runs on WebCrypto (`crypto.subtle`), so every generator is async.
 * Unlike `execution-context.ts`, whose defaults are fixed epoch values for
 * snapshot stability, expiry defaults are computed from `Date.now()` — a token
 * has to be valid *when the test runs*. Pass absolute `issuedAt`/`expiresAt`
 * values alongside `vi.useFakeTimers()` when a test needs determinism.
 */

import {
  type MockAuthContext,
  type MockUser,
  createMockAuthContext,
  createMockUser,
} from "./middleware/execution-context";

// ============================================================================
// Types
// ============================================================================

/**
 * Algorithms a test token can be signed with.
 *
 * `"none"` produces an unsigned token (empty signature segment) for testing
 * that validation rejects it; the HS variants test algorithm allow-listing.
 */
export type JwtTestAlgorithm = "HS256" | "HS384" | "HS512" | "none";

/** Header of a generated test token. */
export interface TestJwtHeader {
  /** Signing algorithm */
  alg: JwtTestAlgorithm;
  /** Token type, always `"JWT"` */
  typ: "JWT";
  /** Key ID, when one was requested */
  kid?: string;
}

/** Payload of a generated test token. */
export interface TestJwtPayload {
  /** Issuer */
  iss?: string;
  /** Subject — the user the token names */
  sub?: string;
  /** Audience */
  aud?: string | string[];
  /** Expiration, epoch seconds */
  exp?: number;
  /** Not-before, epoch seconds */
  nbf?: number;
  /** Issued at, epoch seconds */
  iat: number;
  /** Token ID — unique per generated token unless overridden */
  jti: string;
  /** Custom claims */
  [key: string]: unknown;
}

/** A generated token plus everything a test needs to inspect or verify it. */
export interface TestJwt {
  /** The encoded `header.payload.signature` string */
  token: string;
  /** Secret the token was signed with */
  secret: string;
  /** Decoded header */
  header: TestJwtHeader;
  /** Decoded payload */
  payload: TestJwtPayload;
  /** Expiration as a `Date`-compatible millisecond value, when the token has one */
  expiresAtMs?: number;
}

/** Options for {@link createTestJwt}; every field is optional. */
export interface TestJwtOptions {
  /** Signing secret (defaults to {@link TEST_JWT_SECRET}) */
  secret?: string;
  /** Signing algorithm (defaults to `"HS256"`) */
  algorithm?: JwtTestAlgorithm;
  /** Key ID placed in the header */
  kid?: string;
  /** Subject claim — defaults to `"user-test-1"` */
  subject?: string;
  /** Issuer claim */
  issuer?: string;
  /** Audience claim */
  audience?: string | string[];
  /** Token ID claim — defaults to a fresh unique ID per call */
  jwtId?: string;
  /** Issued-at claim, epoch seconds (defaults to now) */
  issuedAt?: number;
  /** Not-before claim, epoch seconds (unset unless given) */
  notBefore?: number;
  /** Expiration claim, epoch seconds — wins over `expiresInSeconds` */
  expiresAt?: number;
  /** Lifetime in seconds, counted from `issuedAt` (defaults to {@link TEST_TOKEN_TTL_SECONDS}.valid) */
  expiresInSeconds?: number;
  /** Additional custom claims merged into the payload */
  claims?: Record<string, unknown>;
}

/** Structural subset of the server's `JwtValidationResult` an assertion can read. */
export interface JwtValidationOutcome {
  /** Whether validation accepted the token */
  valid: boolean;
  /** Failure reason, when rejected */
  error?: string;
  /** Failure code, when rejected */
  errorCode?: string;
}

/** Options for {@link createAuthenticatedRequest}. */
export interface AuthenticatedRequestOptions {
  /** Token to send in the `authorization` header (defaults to a fresh valid token) */
  token?: string;
  /** HTTP method (defaults to `"GET"`) */
  method?: string;
  /** Absolute URL (defaults to `"http://localhost:3001/api/test"`) */
  url?: string;
  /** Extra headers, merged over the bearer header */
  headers?: Record<string, string>;
  /** Request body — non-string values are JSON-serialized */
  body?: unknown;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Secret every generated token is signed with unless a test passes its own.
 *
 * A single default means a token minted in one helper call can be verified in
 * another without threading the secret through the test.
 */
export const TEST_JWT_SECRET = "test-secret-key-for-jwt-signing";

/**
 * Subject claim a generated token carries unless a test names a user.
 *
 * Exported so an assertion can compare against the same default the builder
 * applies instead of repeating the literal.
 */
export const DEFAULT_JWT_SUBJECT = "user-test-1";

/**
 * Lifetimes the expiry helpers use, in seconds.
 *
 * `soonToExpire` is deliberately longer than the 60-second clock skew
 * `validateJwt` allows by default but short enough that a test can watch the
 * token cross the boundary under fake timers.
 */
export const TEST_TOKEN_TTL_SECONDS = {
  /** Comfortably valid for the duration of a test run */
  valid: 3600,
  /** Still valid, but inside a minute of expiring */
  soonToExpire: 30,
  /** Expired an hour ago */
  expired: -3600,
} as const;

/** Expiry scenario names understood by {@link createTokenForExpiry}. */
export type TokenExpiryScenario = keyof typeof TEST_TOKEN_TTL_SECONDS;

/** Roles a test user can hold, mirroring the server's `UserRole` plus fixtures of its own. */
export type TestUserRole = "admin" | "user" | "guest" | "readonly" | "service";

/**
 * Permissions each role grants, in the server's `resource:action[:own]`
 * vocabulary, mirroring the RBAC checks in `packages/server/src/middleware/`.
 *
 * `"*"` means every permission; a `prefix:*` entry grants every permission
 * under that prefix and a `*:action` entry grants that action on every
 * resource. Kept as strings so this fixture cannot drift from the server's own
 * `Permission` union.
 */
export const ROLE_PERMISSIONS: Record<TestUserRole, readonly string[]> = {
  admin: ["*"],
  user: [
    "trips:create",
    "trips:read",
    "trips:read:own",
    "trips:update:own",
    "trips:delete:own",
    "trips:track:own",
    "subscriptions:create",
    "subscriptions:read",
    "subscriptions:read:own",
    "subscriptions:update:own",
    "subscriptions:delete:own",
    "commutes:create",
    "commutes:read",
    "commutes:read:own",
    "commutes:update:own",
    "commutes:delete:own",
    "journals:create",
    "journals:read",
    "journals:read:own",
    "journals:update:own",
    "journals:delete:own",
    "alerts:read",
    "equipment:read",
    "predictions:read",
    "predictions:read:own",
    "mfa:setup",
    "mfa:verify",
  ],
  guest: ["alerts:read", "equipment:read", "predictions:read"],
  readonly: [
    "trips:read",
    "subscriptions:read",
    "commutes:read",
    "journals:read",
    "alerts:read",
    "equipment:read",
    "predictions:read",
  ],
  service: ["*:read", "write:push"],
};

/** Scopes an auth context can carry, mirroring the server's `ApiKeyScope`. */
export type TestApiKeyScope = "read" | "write" | "admin";

/** Scope each role's key carries, used when building contexts from roles. */
export const ROLE_SCOPES: Record<TestUserRole, TestApiKeyScope> = {
  admin: "admin",
  user: "read",
  guest: "read",
  readonly: "read",
  service: "write",
};

// ============================================================================
// Token Generation
// ============================================================================

/** Monotonic ID source, so generated tokens are unique without needing randomness. */
let jwtIdCounter = 0;

/** @returns A fresh unique token ID, deterministic and collision-free within a process. */
function nextJwtId(): string {
  jwtIdCounter += 1;
  return `jwt-test-${jwtIdCounter}`;
}

/** SHA variant for each supported HMAC algorithm. */
const ALG_HASHES: Record<Exclude<JwtTestAlgorithm, "none">, "SHA-256" | "SHA-384" | "SHA-512"> = {
  HS256: "SHA-256",
  HS384: "SHA-384",
  HS512: "SHA-512",
};

/**
 * Base64URL-encode a UTF-8 string.
 *
 * Mirrors the encoder in `packages/server/src/middleware/jwt-validation.ts`; it
 * is duplicated because that module is server-internal and this package cannot
 * import across the package boundary.
 */
function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Base64URL-decode a segment back into a UTF-8 string, tolerating missing padding.
 *
 * @returns The decoded string, or `null` when the segment is not valid base64url
 */
function base64UrlDecode(segment: string): string | null {
  try {
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Sign a `header.payload` signing input as an HMAC using the algorithm's hash.
 *
 * @returns The base64url signature
 */
async function hmacSign(
  algorithm: Exclude<JwtTestAlgorithm, "none">,
  signingInput: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: ALG_HASHES[algorithm] },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput));
  let binary = "";
  for (const byte of new Uint8Array(signature)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Build a real, signed JWT for testing.
 *
 * Defaults produce a token that passes the server's `validateJwt` with its
 * standard options: HS256, an `iat` of now and an `exp` one hour out. Every
 * claim is overridable, and `claims` adds arbitrary custom payload entries.
 *
 * @param options - Token parts to set (all optional)
 * @returns The encoded token plus its decoded parts and secret
 *
 * @example A token for a specific user with custom claims
 * ```typescript
 * const { token, secret } = await createTestJwt({
 *   subject: "user-42",
 *   issuer: "https://mts.example.com",
 *   audience: "mta-api",
 *   claims: { role: "admin", permissions: ["*"] },
 * });
 * ```
 *
 * @example An unsigned token, for testing rejection of `alg: none`
 * ```typescript
 * const { token } = await createTestJwt({ algorithm: "none" });
 * ```
 */
export async function createTestJwt(options: TestJwtOptions = {}): Promise<TestJwt> {
  const secret = options.secret ?? TEST_JWT_SECRET;
  const algorithm = options.algorithm ?? "HS256";
  const iat = options.issuedAt ?? Math.floor(Date.now() / 1000);
  // `exp` is always set: the server's `validateJwtStructure` rejects tokens
  // without one, so a default that omitted it would be a trap.
  const expiresAt =
    options.expiresAt ??
    (options.expiresInSeconds !== undefined
      ? iat + options.expiresInSeconds
      : iat + TEST_TOKEN_TTL_SECONDS.valid);

  const header: TestJwtHeader = {
    alg: algorithm,
    typ: "JWT",
    ...(options.kid ? { kid: options.kid } : {}),
  };

  const payload: TestJwtPayload = {
    ...options.claims,
    iat,
    jti: options.jwtId ?? nextJwtId(),
    exp: expiresAt,
  };

  payload.sub = options.subject ?? DEFAULT_JWT_SUBJECT;
  if (options.issuer !== undefined) payload.iss = options.issuer;
  if (options.audience !== undefined) payload.aud = options.audience;
  if (options.notBefore !== undefined) payload.nbf = options.notBefore;

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = algorithm === "none" ? "" : await hmacSign(algorithm, signingInput, secret);

  return {
    token: `${signingInput}.${signature}`,
    secret,
    header,
    payload,
    expiresAtMs: payload.exp === undefined ? undefined : payload.exp * 1000,
  };
}

/**
 * Build a token with a named expiry scenario.
 *
 * The scenario picks a lifetime from {@link TEST_TOKEN_TTL_SECONDS}: `"valid"`
 * is an hour out, `"soonToExpire"` thirty seconds out, `"expired"` an hour past.
 * A `notBefore` in the future can be layered on for tokens that are not yet
 * valid.
 *
 * @param scenario - Which expiry scenario to mint
 * @param options - Further token parts, applied on top
 * @returns The generated token
 *
 * @example Every scenario, for an expiry boundary test
 * ```typescript
 * for (const scenario of ["valid", "soonToExpire", "expired"] as const) {
 *   const jwt = await createTokenForExpiry(scenario);
 * }
 * ```
 */
export async function createTokenForExpiry(
  scenario: TokenExpiryScenario,
  options: TestJwtOptions = {}
): Promise<TestJwt> {
  return createTestJwt({ ...options, expiresInSeconds: TEST_TOKEN_TTL_SECONDS[scenario] });
}

/**
 * Build a token that is valid now — the everyday case.
 *
 * @param options - Token parts to set
 * @returns The generated token
 */
export async function createValidToken(options: TestJwtOptions = {}): Promise<TestJwt> {
  return createTokenForExpiry("valid", options);
}

/**
 * Build a token whose `exp` is already in the past.
 *
 * @param options - Token parts to set
 * @returns The generated token
 */
export async function createExpiredToken(options: TestJwtOptions = {}): Promise<TestJwt> {
  return createTokenForExpiry("expired", options);
}

/**
 * Build a token still valid but within {@link TEST_TOKEN_TTL_SECONDS}.soonToExpire
 * of its expiry, for boundary and refresh tests.
 *
 * @param options - Token parts to set
 * @returns The generated token
 */
export async function createSoonToExpireToken(options: TestJwtOptions = {}): Promise<TestJwt> {
  return createTokenForExpiry("soonToExpire", options);
}

/**
 * Build a token whose `nbf` is in the future, so validation must reject it as
 * not yet valid.
 *
 * @param options - Token parts to set
 * @returns The generated token
 */
export async function createNotYetValidToken(options: TestJwtOptions = {}): Promise<TestJwt> {
  return createTestJwt({
    ...options,
    issuedAt: options.issuedAt ?? Math.floor(Date.now() / 1000),
    notBefore: options.notBefore ?? Math.floor(Date.now() / 1000) + TEST_TOKEN_TTL_SECONDS.valid,
  });
}

/**
 * Build one token per expiry scenario, for tests that walk all of them.
 *
 * @param options - Token parts applied to every token in the set
 * @returns Tokens keyed by scenario name
 *
 * @example
 * ```typescript
 * const { valid, soonToExpire, expired } = await createTokenSet({ subject: "user-42" });
 * ```
 */
export async function createTokenSet(
  options: TestJwtOptions = {}
): Promise<Record<TokenExpiryScenario, TestJwt>> {
  const scenarios = Object.keys(TEST_TOKEN_TTL_SECONDS) as TokenExpiryScenario[];
  const entries = await Promise.all(
    scenarios.map(
      async (scenario) => [scenario, await createTokenForExpiry(scenario, options)] as const
    )
  );
  return Object.fromEntries(entries);
}

// ============================================================================
// Decoding and Expiry Inspection
// ============================================================================

/**
 * Decode a token without verifying its signature.
 *
 * @param token - Encoded JWT
 * @returns The header and payload, or `null` when the token is not a decodable three-part JWT
 */
export function decodeTestJwt(
  token: string
): { header: TestJwtHeader; payload: TestJwtPayload } | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  try {
    const headerJson = base64UrlDecode(parts[0]);
    const payloadJson = base64UrlDecode(parts[1]);
    if (headerJson === null || payloadJson === null) {
      return null;
    }
    return { header: JSON.parse(headerJson), payload: JSON.parse(payloadJson) };
  } catch {
    return null;
  }
}

/**
 * Whether a token's `exp` has passed, allowing for a clock skew.
 *
 * Tokens without an `exp` are reported as not expired, matching validators
 * that treat a missing expiry as unbounded.
 *
 * @param token - Encoded JWT
 * @param clockSkewSeconds - Tolerance, in seconds (default `0`)
 * @returns `true` when the token is past expiry beyond the skew
 */
export function isTokenExpired(token: string, clockSkewSeconds = 0): boolean {
  const payload = decodeTestJwt(token)?.payload;
  if (!payload?.exp) {
    return false;
  }
  return payload.exp + clockSkewSeconds < Math.floor(Date.now() / 1000);
}

/**
 * Seconds until a token expires, negative once it has.
 *
 * @param token - Encoded JWT
 * @returns Seconds remaining, or `null` when the token carries no `exp`
 */
export function secondsUntilExpiry(token: string): number | null {
  const payload = decodeTestJwt(token)?.payload;
  if (!payload?.exp) {
    return null;
  }
  return payload.exp - Math.floor(Date.now() / 1000);
}

// ============================================================================
// Authentication Context Builders
// ============================================================================

/**
 * Build the `authorization` header value for a bearer token.
 *
 * @param token - Encoded JWT, with or without an existing `Bearer ` prefix
 * @returns A `"Bearer <token>"` string
 */
export function createBearerToken(token: string): string {
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}

/**
 * Build a `Headers` object carrying a bearer token.
 *
 * @param token - Encoded JWT
 * @returns Headers with an `authorization` entry
 */
export function createBearerHeaders(token: string): Headers {
  return new Headers({ authorization: createBearerToken(token) });
}

/**
 * Build a real `Request` carrying a bearer token, for middleware tests.
 *
 * Complements `createMiddlewareRequest` in `middleware/middleware-helpers.ts`
 * with the authentication header already set.
 *
 * @param options - Request parts; `token` defaults to a freshly minted valid token
 * @returns A standard `Request` instance with an `authorization` header
 *
 * @example
 * ```typescript
 * const jwt = await createValidToken({ subject: "user-42" });
 * const request = await createAuthenticatedRequest({ token: jwt.token, method: "POST", body: { id: "725" } });
 * ```
 */
export async function createAuthenticatedRequest(
  options: AuthenticatedRequestOptions = {}
): Promise<Request> {
  const { token, ...requestOptions } = options;
  const headers = new Headers(requestOptions.headers);
  // A test that only cares about being authenticated should not have to mint a
  // token first — the request is async because minting one is.
  headers.set("authorization", createBearerToken(token ?? (await createTestJwt()).token));
  // `new Request` defaults a string body to `text/plain`, which no API route
  // reads; mark an object body as the JSON it is about to be serialized to.
  if (
    requestOptions.body !== undefined &&
    typeof requestOptions.body !== "string" &&
    !headers.has("content-type")
  ) {
    headers.set("content-type", "application/json");
  }
  return new Request(requestOptions.url ?? "http://localhost:3001/api/test", {
    method: requestOptions.method ?? "GET",
    headers,
    ...(requestOptions.body === undefined
      ? {}
      : {
          body:
            typeof requestOptions.body === "string"
              ? requestOptions.body
              : JSON.stringify(requestOptions.body),
        }),
  });
}

/**
 * Build an auth context derived from a generated token's claims.
 *
 * The role and permissions travel in the payload as `role` and `permissions`
 * claims when the token was minted with them (see {@link claimsForRole}), and
 * the returned context mirrors the server's `AuthContext` so it can be handed
 * straight to middleware.
 *
 * @param jwt - The generated token to read
 * @param overrides - Auth context fields to replace
 * @returns A complete mock auth context
 *
 * @example
 * ```typescript
 * const jwt = await createValidToken({ claims: claimsForRole("admin") });
 * const auth = createAuthContextForToken(jwt, { scope: "admin" });
 * ```
 */
export function createAuthContextForToken(
  jwt: TestJwt,
  overrides: Partial<MockAuthContext> = {}
): MockAuthContext {
  const role =
    typeof jwt.payload.role === "string" ? (jwt.payload.role as TestUserRole) : undefined;

  return createMockAuthContext({
    ...(role && role in ROLE_SCOPES ? { scope: ROLE_SCOPES[role], role, roles: [role] } : {}),
    keyId: `key-${jwt.payload.jti}`,
    sessionId: `session-${jwt.payload.jti}`,
    ...overrides,
  });
}

// ============================================================================
// Role and Permission Fixtures
// ============================================================================

/**
 * Payload claims a token needs to carry a role's authority.
 *
 * @param role - Role to mint claims for
 * @param extra - Claims merged over the role claims
 * @returns A claims object suitable for {@link createTestJwt}'s `claims` option
 *
 * @example
 * ```typescript
 * const jwt = await createValidToken({ claims: claimsForRole("readonly") });
 * ```
 */
export function claimsForRole(
  role: TestUserRole,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return { role, roles: [role], permissions: [...ROLE_PERMISSIONS[role]], ...extra };
}

/**
 * Build a user fixture holding a role, with the permissions that role grants.
 *
 * Reuses the mock user shape from `middleware/execution-context.ts`.
 *
 * @param role - Role the user holds
 * @param overrides - User fields to replace
 * @returns A complete mock user
 *
 * @example
 * ```typescript
 * const admin = createUserForRole("admin");
 * expect(admin.permissions).toEqual(["*"]);
 * ```
 */
export function createUserForRole(role: TestUserRole, overrides: Partial<MockUser> = {}): MockUser {
  // `readonly` and `service` are fixture-only roles with no server counterpart,
  // so they map onto `user` for the `MockUser.role` field the server reads.
  const mockRole: MockUser["role"] = role === "readonly" || role === "service" ? "user" : role;

  return createMockUser({
    role: mockRole,
    roles: [role] as MockUser["roles"],
    permissions: [...ROLE_PERMISSIONS[role]],
    ...overrides,
  });
}

/**
 * Whether a role grants a permission, honouring the three wildcard forms.
 *
 * `"*"` grants everything, `prefix:*` grants every permission under a prefix
 * (`alerts:*` covers `alerts:read`) and `*:action` grants an action on every
 * resource (`*:read` covers `trips:read`). Anything else matches exactly.
 *
 * @param role - Role to check
 * @param permission - Permission being requested
 * @returns `true` when the role grants it
 */
export function roleHasPermission(role: TestUserRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role].some((granted) => {
    if (granted === "*") {
      return true;
    }
    if (granted.endsWith(":*")) {
      return permission.startsWith(granted.slice(0, -1));
    }
    if (granted.startsWith("*:")) {
      return permission.endsWith(granted.slice(1));
    }
    return granted === permission;
  });
}

// ============================================================================
// Token Assertions
// ============================================================================

/**
 * Assert a string is a structurally valid, decodable JWT.
 *
 * @param token - Value a test received as a token
 * @throws When the value is not three base64url segments carrying a JSON header and payload
 */
export function assertJwtShape(token: string): void {
  const decoded = decodeTestJwt(token);
  if (decoded === null) {
    throw new Error(
      `Expected a decodable JWT (header.payload.signature), got: ${JSON.stringify(token).slice(0, 80)}`
    );
  }
  if (typeof decoded.header.alg !== "string") {
    throw new Error(
      `Expected the JWT header to declare an algorithm, got: ${JSON.stringify(decoded.header)}`
    );
  }
}

/**
 * Assert a token carries specific claims.
 *
 * Only the claims listed in `expected` are compared; a token may carry others.
 * Values are compared with deep equality.
 *
 * @param token - Encoded JWT
 * @param expected - Claims the token must hold
 * @throws When any expected claim is missing or differs
 */
export function assertJwtClaims(token: string, expected: Record<string, unknown>): void {
  const payload = decodeTestJwt(token)?.payload;
  if (!payload) {
    throw new Error("Cannot assert claims on a token that does not decode");
  }

  const mismatches = Object.entries(expected)
    .filter(([claim, value]) => JSON.stringify(payload[claim]) !== JSON.stringify(value))
    .map(
      ([claim, value]) =>
        `  ${claim}: expected ${JSON.stringify(value)}, got ${JSON.stringify(payload[claim])}`
    );

  if (mismatches.length > 0) {
    throw new Error(`JWT claims did not match:\n${mismatches.join("\n")}`);
  }
}

/**
 * Assert a token is past expiry.
 *
 * @param token - Encoded JWT
 * @param clockSkewSeconds - Tolerance, in seconds (default `0`)
 * @throws When the token is still valid
 */
export function assertTokenExpired(token: string, clockSkewSeconds = 0): void {
  if (!isTokenExpired(token, clockSkewSeconds)) {
    const remaining = secondsUntilExpiry(token);
    throw new Error(
      `Expected token to be expired, but it is valid for ${remaining === null ? "an unlimited time" : `${remaining}s`}`
    );
  }
}

/**
 * Assert a token is still valid — not past expiry, skew included.
 *
 * @param token - Encoded JWT
 * @param clockSkewSeconds - Tolerance, in seconds (default `0`)
 * @throws When the token has expired
 */
export function assertTokenActive(token: string, clockSkewSeconds = 0): void {
  if (isTokenExpired(token, clockSkewSeconds)) {
    const exp = decodeTestJwt(token)?.payload.exp;
    throw new Error(
      `Expected token to be active, but it expired at ${new Date((exp ?? 0) * 1000).toISOString()}`
    );
  }
}

/**
 * Assert a token's signature verifies against a secret.
 *
 * Only HMAC algorithms are checked; an `alg: none` token verifies only against
 * an empty signature.
 *
 * @param token - Encoded JWT
 * @param secret - Secret the token is expected to be signed with
 * @returns A promise resolving once the signature has been checked
 * @throws When the signature does not match
 */
export async function assertJwtSignedWith(token: string, secret: string): Promise<void> {
  const decoded = decodeTestJwt(token);
  if (decoded === null) {
    throw new Error("Cannot verify the signature of a token that does not decode");
  }

  const { header } = decoded;
  const signingInput = token.split(".").slice(0, 2).join(".");
  const expected =
    header.alg === "none"
      ? ""
      : await hmacSign(header.alg as Exclude<JwtTestAlgorithm, "none">, signingInput, secret);
  const actual = token.split(".")[2];

  if (actual !== expected) {
    throw new Error(
      `JWT signature did not verify against the given secret (algorithm ${header.alg}); the token may be signed with a different secret or tampered`
    );
  }
}

/**
 * Assert a validation result rejected the token, and optionally why.
 *
 * Accepts any result shaped like the server's `JwtValidationResult`, so a test
 * can assert on `validateJwt` output directly.
 *
 * @param result - Validation result to check
 * @param errorCode - Code the rejection must carry, when known
 * @throws When the result accepted the token, or rejected it with a different code
 *
 * @example
 * ```typescript
 * const result = await validateJwt((await createExpiredToken()).token, TEST_JWT_SECRET);
 * assertJwtRejected(result, "TOKEN_EXPIRED");
 * ```
 */
export function assertJwtRejected(result: JwtValidationOutcome, errorCode?: string): void {
  if (result.valid) {
    throw new Error("Expected the token to be rejected, but validation accepted it");
  }
  if (errorCode !== undefined && result.errorCode !== errorCode) {
    throw new Error(
      `Expected the token to be rejected with ${errorCode}, got ${result.errorCode ?? "no code"} (${result.error ?? "no error"})`
    );
  }
}

/**
 * Assert a validation result accepted the token.
 *
 * @param result - Validation result to check
 * @throws When the result rejected the token
 */
export function assertJwtAccepted(result: JwtValidationOutcome): void {
  if (!result.valid) {
    throw new Error(
      `Expected the token to be accepted, but validation rejected it: ${result.errorCode ?? "no code"} (${result.error ?? "no error"})`
    );
  }
}
