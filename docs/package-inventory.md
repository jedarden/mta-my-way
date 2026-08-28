# MTA My Way - Package.json Files Inventory

Generated: 2026-08-28

## Complete List of package.json Files

This document enumerates all `package.json` files in the project (excluding `node_modules` dependencies).

### Root Workspace
**Path:** `/home/coding/mta-my-way/package.json`
- **Name:** `mta-my-way`
- **Type:** Workspace root (monorepo)
- **Version:** 0.0.1
- **Workspaces:** `packages/shared`, `packages/server`, `packages/web`, `tests/e2e`
- **Purpose:** Root configuration for the entire monorepo, defines workspace members and shared scripts
- **Key Scripts:** build, lint, test, typecheck, migration commands

---

### Server Package
**Path:** `/home/coding/mta-my-way/packages/server/package.json`
- **Name:** `@mta-my-way/server`
- **Type:** ESM module
- **Version:** 0.0.1
- **Main Entry:** `./dist/index.js`
- **Purpose:** Hono-based Node.js backend server with GTFS realtime processing, database migrations, and authentication
- **Key Dependencies:** Hono, better-sqlite3, protobufjs, web-push, zod, OpenTelemetry
- **Key Scripts:** build, dev, start, process-gtfs, migration commands

---

### Web Package
**Path:** `/home/coding/mta-my-way/packages/web/package.json`
- **Name:** `@mta-my-way/web`
- **Type:** ESM module
- **Version:** 0.0.1
- **Purpose:** React + Vite frontend PWA with Tailwind CSS
- **Key Dependencies:** React 19, React Router, Zustand, html2canvas
- **Key Scripts:** dev, build, preview, typecheck, lint, test
- **PWA Support:** vite-plugin-pwa, workbox-window

---

### Shared Package
**Path:** `/home/coding/mta-my-way/packages/shared/package.json`
- **Name:** `@mta-my-way/shared`
- **Type:** ESM module
- **Version:** 0.0.1
- **Main Entry:** `./dist/index.js`
- **Purpose:** Shared TypeScript types, utilities, and test helpers used by both server and web packages
- **Key Dependencies:** zod, OpenTelemetry API
- **Exports:** Main package, plus testing utilities (security-helpers, observability-helpers, test-helpers)

---

### E2E Tests Package
**Path:** `/home/coding/mta-my-way/tests/e2e/package.json`
- **Name:** `@mta-my-way/e2e`
- **Type:** ESM module
- **Version:** 0.0.1
- **Purpose:** End-to-end testing with Playwright
- **Key Dependencies:** @playwright/test
- **Key Scripts:** test, test:headed, test:ui, test:debug, install-browser

---

## Summary

- **Total package.json files:** 5
- **Monorepo structure:** Root workspace + 4 workspace members
- **Package manager:** npm (workspaces)
- **Module system:** ESM (type: "module" in all packages)
- **Node version requirement:** >=22.0.0

## Dependency Overview

### Shared Across Multiple Packages
- **zod:** Schema validation (server, shared)
- **OpenTelemetry:** Observability (root, server, shared)
- **vitest:** Testing framework (root, server, shared, web)
- **TypeScript:** Type checking (root, server, shared, web)

### Backend-Specific
- **Hono:** Web framework
- **better-sqlite3:** Database
- **protobufjs:** GTFS realtime protocol buffers
- **web-push:** Push notifications
- **argon2:** Password hashing

### Frontend-Specific
- **React 19:** UI framework
- **Vite:** Build tool
- **Tailwind CSS:** Styling
- **Zustand:** State management
- **React Router:** Client-side routing

### E2E Testing
- **Playwright:** Browser automation
