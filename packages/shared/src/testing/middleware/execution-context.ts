/**
 * Builders for the execution context middleware reads: the user behind a
 * request, the auth credentials it presented, and the audit event it produces.
 *
 * Every builder returns a complete object with deterministic defaults — fixed
 * IDs and a fixed epoch timestamp, never `Date.now()` — so a test can read any
 * field without setting it first and snapshot tests stay stable. Overrides
 * replace whole fields, and each builder can be used standalone: a test that
 * only needs an auth context never has to build a user to get one.
 *
 * The shapes mirror what `packages/server/src/middleware/` puts on a request —
 * `AuthContext` from `authentication.ts` and `AuditEvent` from `audit-log.ts`.
 * The unions that are small and stable (`role`, `scope`, `authMethod`,
 * severity, category) are typed as literals so a typo fails typecheck; the
 * permission list is typed `string[]` because the server's `Permission` union
 * lives across the package boundary and would drift from here.
 *
 * {@link createMockExecutionContext} builds all three at once, wired together:
 * one user, an auth context carrying that user's roles, and an audit event
 * attributed to them.
 */

// ============================================================================
// Types
// ============================================================================

/** User roles, mirroring the server's `UserRole`. */
export type MockUserRole = "admin" | "user" | "guest";

/** API key scopes, mirroring the server's `ApiKeyScope`. */
export type MockApiKeyScope = "read" | "write" | "admin";

/** How a request authenticated, mirroring the server's `authMethod` union. */
export type MockAuthMethod = "api_key" | "session" | "oauth" | "signature";

/** Audit event categories, mirroring the server's `AuditEventCategory`. */
export type MockAuditEventCategory =
  | "authentication"
  | "authorization"
  | "api_keys"
  | "users"
  | "sessions"
  | "admin"
  | "data_access"
  | "configuration"
  | "security";

/** Audit event severities, mirroring the server's `AuditEventSeverity`. */
export type MockAuditEventSeverity = "info" | "warning" | "error" | "critical";

/** The user a request is acting for. */
export interface MockUser {
  /** Stable user ID */
  id: string;
  /** Login name */
  username: string;
  /** Email address */
  email: string;
  /** Highest-weight role, as the server's RBAC reads it */
  role: MockUserRole;
  /** Every role held, `role` included */
  roles: MockUserRole[];
  /**
   * Permission strings, mirroring the server's `Permission` union — kept as
   * `string[]` so this shared-module type cannot drift from the server's own.
   */
  permissions: string[];
  /** Whether the account is enabled */
  active: boolean;
  /** Account creation time, as a fixed epoch for deterministic tests */
  createdAt: number;
}

/** Auth credentials a request presented, mirroring the server's `AuthContext`. */
export interface MockAuthContext {
  /** API key ID the request authenticated with */
  keyId: string;
  /** Permission scope carried by that key */
  scope: MockApiKeyScope;
  /** Highest-weight role for RBAC */
  role?: MockUserRole;
  /** Every role held */
  roles?: MockUserRole[];
  /** Permissions beyond what the roles imply */
  additionalPermissions?: string[];
  /** Session ID, when authenticated via a session */
  sessionId?: string;
  /** Rate limit tier the credentials fall in */
  rateLimitTier: number;
  /** Whether MFA was verified for this session */
  mfaVerified?: boolean;
  /** How the request authenticated */
  authMethod: MockAuthMethod;
  /** OAuth provider, when authenticated via OAuth */
  oauthProvider?: string;
}

/** Audit event a request produces, mirroring the server's `AuditEvent`. */
export interface MockAuditEvent {
  /** Stable event ID */
  id: string;
  /** Event time, as a fixed epoch for deterministic tests */
  timestamp: number;
  /** Event category */
  category: MockAuditEventCategory;
  /** Event severity */
  severity: MockAuditEventSeverity;
  /** Event action, in `resource:verb` form */
  action: string;
  /** Resource type affected */
  resourceType?: string;
  /** Resource ID affected */
  resourceId?: string;
  /** User who performed the action */
  performedBy?: string;
  /** Role the user acted under */
  role?: string;
  /** Whether the action succeeded */
  success: boolean;
  /** Error message, when the action failed */
  error?: string;
  /** Client IP the action came from */
  clientIp?: string;
  /** User agent the action came from */
  userAgent?: string;
  /** Request path */
  path?: string;
  /** Request method */
  method?: string;
  /** Additional event metadata */
  metadata?: Record<string, unknown>;
}

/** The user, auth and audit halves of one request, built together. */
export interface MockExecutionContext {
  /** User the request acts for */
  user: MockUser;
  /** Credentials the request presented */
  auth: MockAuthContext;
  /** Audit event the request produces */
  audit: MockAuditEvent;
}

/** Options for {@link createMockUser}; every field is optional. */
export type MockUserOptions = Partial<MockUser>;

/** Options for {@link createMockAuthContext}; every field is optional. */
export type MockAuthContextOptions = Partial<MockAuthContext>;

/** Options for {@link createMockAuditEvent}; every field is optional. */
export type MockAuditEventOptions = Partial<MockAuditEvent>;

/** Options for {@link createMockExecutionContext}. */
export interface MockExecutionContextOptions {
  /** Replaces the built user wholesale */
  user?: MockUserOptions;
  /** Replaces the built auth context wholesale */
  auth?: MockAuthContextOptions;
  /** Replaces the built audit event wholesale */
  audit?: MockAuditEventOptions;
}

// ============================================================================
// Builders
// ============================================================================

/** Fixed epoch used by every default timestamp, so tests are deterministic. */
export const MOCK_CONTEXT_TIMESTAMP = 1_700_000_000_000;

/**
 * Build a mock user: a regular, active account.
 *
 * @param overrides - Fields to replace (each replaces whole, arrays included)
 * @returns A complete mock user
 *
 * @example An admin user
 * ```typescript
 * const admin = createMockUser({ role: "admin", roles: ["admin"] });
 * ```
 */
export function createMockUser(overrides: MockUserOptions = {}): MockUser {
  return {
    id: "user-test-1",
    username: "test-rider",
    email: "test-rider@example.com",
    role: "user",
    roles: ["user"],
    permissions: ["trips:read:own", "trips:create", "trips:track:own"],
    active: true,
    createdAt: MOCK_CONTEXT_TIMESTAMP,
    ...overrides,
  };
}

/**
 * Build a mock auth context: a session-authenticated `read` key.
 *
 * @param overrides - Fields to replace (each replaces whole, arrays included)
 * @returns A complete mock auth context
 *
 * @example An admin-scoped API key
 * ```typescript
 * const auth = createMockAuthContext({
 *   scope: "admin",
 *   role: "admin",
 *   roles: ["admin"],
 *   authMethod: "api_key",
 *   sessionId: undefined,
 * });
 * ```
 */
export function createMockAuthContext(overrides: MockAuthContextOptions = {}): MockAuthContext {
  return {
    keyId: "key-test-1",
    scope: "read",
    role: "user",
    roles: ["user"],
    sessionId: "session-test-1",
    rateLimitTier: 1,
    mfaVerified: false,
    authMethod: "session",
    ...overrides,
  };
}

/**
 * Build a mock audit event: a successful `authentication` event at `info`.
 *
 * @param overrides - Fields to replace (each replaces whole, `metadata` included)
 * @returns A complete mock audit event
 *
 * @example A failed admin action
 * ```typescript
 * const event = createMockAuditEvent({
 *   category: "admin",
 *   severity: "warning",
 *   action: "admin:purge_cache",
 *   success: false,
 *   error: "insufficient_scope",
 * });
 * ```
 */
export function createMockAuditEvent(overrides: MockAuditEventOptions = {}): MockAuditEvent {
  return {
    id: "audit-test-1",
    timestamp: MOCK_CONTEXT_TIMESTAMP,
    category: "authentication",
    severity: "info",
    action: "authentication:session_created",
    performedBy: "user-test-1",
    role: "user",
    success: true,
    clientIp: "127.0.0.1",
    userAgent: "test-agent",
    method: "GET",
    path: "/api/test",
    ...overrides,
  };
}

/**
 * Build a user, auth context and audit event together, wired to each other.
 *
 * The wiring is one-directional, from the user outward: the auth context
 * inherits the user's `role`/`roles`, and the audit event is attributed to the
 * user's ID and role. Passing an explicit `auth` or `audit` override replaces
 * that part whole — no field is re-derived into an explicitly supplied object,
 * so a test can hand-build one part without the builder quietly editing it.
 *
 * @param options - Overrides for each part
 * @returns A coherent user, auth context and audit event
 *
 * @example Everything, then one field changed
 * ```typescript
 * const context = createMockExecutionContext({
 *   user: { role: "admin", roles: ["admin"] },
 *   audit: { action: "admin:purge_cache", category: "admin" },
 * });
 * expect(context.audit.performedBy).toBe(context.user.id);
 * ```
 */
export function createMockExecutionContext(
  options: MockExecutionContextOptions = {}
): MockExecutionContext {
  const user = createMockUser(options.user);

  const auth = options.auth
    ? createMockAuthContext(options.auth)
    : createMockAuthContext({ role: user.role, roles: user.roles });

  const audit = options.audit
    ? createMockAuditEvent(options.audit)
    : createMockAuditEvent({ performedBy: user.id, role: user.role });

  return { user, auth, audit };
}
