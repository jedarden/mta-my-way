/**
 * Tests for the user, auth and audit context builders in
 * `execution-context.ts`.
 *
 * The important properties are that every builder returns a complete object
 * with deterministic defaults, that overrides replace fields whole, and that
 * {@link createMockExecutionContext} wires its three parts together without
 * re-deriving into a part the caller supplied.
 */

import {
  MOCK_CONTEXT_TIMESTAMP,
  createMockAuditEvent,
  createMockAuthContext,
  createMockExecutionContext,
  createMockUser,
} from "@mta-my-way/shared/testing/middleware";
import { describe, expect, it } from "vitest";

describe("createMockUser", () => {
  it("returns a complete, active regular user with deterministic defaults", () => {
    const user = createMockUser();

    expect(user).toEqual({
      id: "user-test-1",
      username: "test-rider",
      email: "test-rider@example.com",
      role: "user",
      roles: ["user"],
      permissions: ["trips:read:own", "trips:create", "trips:track:own"],
      active: true,
      createdAt: MOCK_CONTEXT_TIMESTAMP,
    });
  });

  it("is deterministic across calls", () => {
    expect(createMockUser()).toEqual(createMockUser());
  });

  it("replaces whole fields, arrays included", () => {
    const admin = createMockUser({ role: "admin", roles: ["admin"] });

    expect(admin.role).toBe("admin");
    expect(admin.roles).toEqual(["admin"]);
    expect(admin.id).toBe("user-test-1");
  });

  it("does not share field state between instances", () => {
    const first = createMockUser();
    const second = createMockUser();

    first.roles.push("guest");

    expect(second.roles).toEqual(["user"]);
  });

  it("keeps `role` a closed union rather than any string", () => {
    const overrides = { role: "superuser" } as const;

    // @ts-expect-error — "superuser" is not one of the server's `UserRole` values
    const user = createMockUser(overrides);

    // The builders do not validate at runtime — the type system does.
    expect(user.role).toBe("superuser");
  });
});

describe("createMockAuthContext", () => {
  it("returns a complete session-authenticated read context", () => {
    expect(createMockAuthContext()).toEqual({
      keyId: "key-test-1",
      scope: "read",
      role: "user",
      roles: ["user"],
      sessionId: "session-test-1",
      rateLimitTier: 1,
      mfaVerified: false,
      authMethod: "session",
    });
  });

  it("switches to an API key by dropping the session", () => {
    const auth = createMockAuthContext({
      authMethod: "api_key",
      scope: "admin",
      role: "admin",
      roles: ["admin"],
      sessionId: undefined,
    });

    expect(auth.authMethod).toBe("api_key");
    expect(auth.scope).toBe("admin");
    expect(auth.sessionId).toBeUndefined();
    expect(auth.keyId).toBe("key-test-1");
  });

  it("carries an OAuth provider when the method is oauth", () => {
    const auth = createMockAuthContext({
      authMethod: "oauth",
      oauthProvider: "google",
    });

    expect(auth.oauthProvider).toBe("google");
  });
});

describe("createMockAuditEvent", () => {
  it("returns a successful info-level authentication event", () => {
    expect(createMockAuditEvent()).toEqual({
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
    });
  });

  it("builds a failure event with an error message", () => {
    const event = createMockAuditEvent({
      category: "authorization",
      severity: "warning",
      action: "authorization:denied",
      success: false,
      error: "insufficient_scope",
    });

    expect(event.success).toBe(false);
    expect(event.error).toBe("insufficient_scope");
    expect(event.severity).toBe("warning");
  });

  it("carries resource and metadata fields", () => {
    const event = createMockAuditEvent({
      action: "api_keys:revoked",
      category: "api_keys",
      resourceType: "api_key",
      resourceId: "key-9",
      metadata: { reason: "rotated" },
    });

    expect(event.resourceType).toBe("api_key");
    expect(event.resourceId).toBe("key-9");
    expect(event.metadata).toEqual({ reason: "rotated" });
  });
});

describe("createMockExecutionContext", () => {
  it("builds all three parts, attributed to the user", () => {
    const context = createMockExecutionContext();

    expect(context.user).toEqual(createMockUser());
    expect(context.auth).toEqual(createMockAuthContext());
    expect(context.audit).toEqual(createMockAuditEvent());
  });

  it("derives the auth roles and the audit attribution from the user", () => {
    const context = createMockExecutionContext({
      user: { role: "admin", roles: ["admin"] },
    });

    expect(context.auth.role).toBe("admin");
    expect(context.auth.roles).toEqual(["admin"]);
    expect(context.audit.performedBy).toBe(context.user.id);
    expect(context.audit.role).toBe("admin");
  });

  it("does not re-derive into an explicitly supplied auth context", () => {
    const context = createMockExecutionContext({
      user: { role: "admin", roles: ["admin"] },
      auth: { role: "guest" },
    });

    expect(context.auth.role).toBe("guest");
    expect(context.user.role).toBe("admin");
  });

  it("does not re-derive into an explicitly supplied audit event", () => {
    const context = createMockExecutionContext({
      user: { id: "user-real", role: "admin" },
      audit: { action: "admin:purge_cache", performedBy: "someone-else" },
    });

    expect(context.audit.performedBy).toBe("someone-else");
  });

  it("keeps the default audit attribution when only auth is overridden", () => {
    const context = createMockExecutionContext({ auth: { scope: "write" } });

    expect(context.audit.performedBy).toBe(context.user.id);
    expect(context.auth.scope).toBe("write");
  });
});
