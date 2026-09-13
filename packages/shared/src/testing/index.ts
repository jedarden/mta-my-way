/**
 * Test helpers for MTA My Way.
 *
 * This barrel file exports all testing utilities from the shared package.
 * Import individual helpers or entire modules as needed.
 *
 * @example
 * ```ts
 * import { createMockStation, createMockRoute } from "@mta-my-way/shared/testing";
 * ```
 */

// Core test helpers
export * from "./test-helpers";

// Security testing utilities
export * from "./security-helpers";

// Observability testing utilities
export * from "./observability-helpers";

// Response validation utilities
export * from "./response-validation";

// Middleware testing utilities
export * from "./middleware";

// Named role fixtures: admin, regular user and guest
export * from "./user-fixtures";

// Deterministic test data seeds: stations, routes, arrivals, alerts, trips
export * from "./seed-helpers";

// Audit trail assertions: recorder sink plus event and trail assertions
export * from "./audit-assertions";
