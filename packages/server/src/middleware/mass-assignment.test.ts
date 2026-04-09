/**
 * Mass assignment protection middleware tests.
 */

import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import {
  PUSH_SUBSCRIPTION_FIELDS,
  TRIP_NOTES_FIELDS,
  filterAllowedFields,
  getSanitizedBody,
  massAssignmentProtection,
  removeSensitiveFields,
  validateMassAssignment,
} from "./mass-assignment.js";

describe("massAssignmentProtection middleware", () => {
  test("allows requests with only allowed fields", async () => {
    const app = new Hono();
    app.post(
      "/api/test",
      massAssignmentProtection({
        allowedFields: ["name", "email"],
        stripUnknown: true,
      }),
      async (c) => {
        return c.json({ success: true });
      }
    );

    const res = await app.request("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", email: "test@example.com" }),
    });

    expect(res.status).toBe(200);
  });

  test("rejects requests with blocked fields", async () => {
    const app = new Hono();
    app.post(
      "/api/test",
      massAssignmentProtection({
        blockedFields: ["role", "isAdmin"],
      }),
      async (c) => {
        return c.json({ success: true });
      }
    );

    const res = await app.request("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", role: "admin" }),
    });

    expect(res.status).toBe(400);
  });

  test("strips unknown fields when stripUnknown is true", async () => {
    const app = new Hono();
    app.post(
      "/api/test",
      massAssignmentProtection({
        allowedFields: ["name", "username"],
        stripUnknown: true,
      }),
      async (c) => {
        const sanitized = getSanitizedBody(c);
        return c.json({ sanitized });
      }
    );

    const res = await app.request("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", username: "testuser", unknown: "field" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sanitized).toEqual({ name: "Test", username: "testuser" });
  });

  test("blocks requests with nested objects by default", async () => {
    const app = new Hono();
    app.post(
      "/api/test",
      massAssignmentProtection({
        allowedFields: ["name"],
      }),
      async (c) => {
        return c.json({ success: true });
      }
    );

    const res = await app.request("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", nested: { value: "test" } }),
    });

    expect(res.status).toBe(400);
  });

  test("allows nested objects when allowNested is true", async () => {
    const app = new Hono();
    app.post(
      "/api/test",
      massAssignmentProtection({
        allowedFields: ["name", "nested", "value"],
        allowNested: true,
        maxDepth: 2,
      }),
      async (c) => {
        return c.json({ success: true });
      }
    );

    const res = await app.request("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", nested: { value: "test" } }),
    });

    expect(res.status).toBe(200);
  });

  test("blocks sensitive fields by default", async () => {
    const app = new Hono();
    app.post("/api/test", massAssignmentProtection({}), async (c) => {
      return c.json({ success: true });
    });

    const res = await app.request("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", isAdmin: true }),
    });

    expect(res.status).toBe(400);
  });

  test("skips non-JSON requests", async () => {
    const app = new Hono();
    app.post(
      "/api/test",
      massAssignmentProtection({
        allowedFields: ["name"],
      }),
      async (c) => {
        return c.json({ success: true });
      }
    );

    const res = await app.request("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "name=Test",
    });

    expect(res.status).toBe(200);
  });
});

describe("validateMassAssignment", () => {
  test("validates data with allowed fields", () => {
    const data = { name: "Test", username: "testuser" };
    const result = validateMassAssignment(data, {
      allowedFields: ["name", "username"],
    });

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test("detects unknown fields", () => {
    const data = { name: "Test", unknown: "field" };
    const result = validateMassAssignment(data, {
      allowedFields: ["name"],
    });

    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.type).toBe("unknown_field");
  });

  test("detects blocked fields", () => {
    const data = { name: "Test", role: "admin" };
    const result = validateMassAssignment(data, {
      blockedFields: ["role"],
    });

    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.type).toBe("blocked_field");
  });

  test("detects nested objects", () => {
    const data = { name: "Test", nested: { value: "test" } };
    const result = validateMassAssignment(data, {
      allowNested: false,
    });

    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.type).toBe("nested_object");
  });

  test("sanitizes data when stripUnknown is true", () => {
    const data = { name: "Test", unknown: "field" };
    const result = validateMassAssignment(data, {
      allowedFields: ["name"],
      stripUnknown: true,
    });

    expect(result.valid).toBe(true);
    expect(result.sanitized).toEqual({ name: "Test" });
  });
});

describe("filterAllowedFields", () => {
  test("filters object to only include allowed fields", () => {
    const data = {
      name: "Test",
      email: "test@example.com",
      unknown: "field",
    };
    const filtered = filterAllowedFields(data, ["name", "email"]);

    expect(filtered).toEqual({ name: "Test", email: "test@example.com" });
    expect(filtered).not.toHaveProperty("unknown");
  });
});

describe("removeSensitiveFields", () => {
  test("removes sensitive fields from object", () => {
    const data = {
      name: "Test",
      username: "testuser",
      isAdmin: true,
      role: "user",
    };
    const sanitized = removeSensitiveFields(data);

    expect(sanitized).toEqual({ name: "Test", username: "testuser" });
    expect(sanitized).not.toHaveProperty("isAdmin");
    expect(sanitized).not.toHaveProperty("role");
  });

  test("removes additional specified fields", () => {
    const data = {
      name: "Test",
      username: "testuser",
      customField: "sensitive",
    };
    const sanitized = removeSensitiveFields(data, ["customField"]);

    expect(sanitized).toEqual({ name: "Test", username: "testuser" });
    expect(sanitized).not.toHaveProperty("customField");
  });
});

describe("Common field allow-lists", () => {
  test("PUSH_SUBSCRIPTION_FIELDS contains expected fields", () => {
    expect(PUSH_SUBSCRIPTION_FIELDS).toContain("endpoint");
    expect(PUSH_SUBSCRIPTION_FIELDS).toContain("favorites");
    expect(PUSH_SUBSCRIPTION_FIELDS).toContain("quietHours");
  });

  test("TRIP_NOTES_FIELDS contains expected fields", () => {
    expect(TRIP_NOTES_FIELDS).toContain("notes");
  });
});
