/**
 * X-Request-ID middleware.
 *
 * Generates a unique request ID per request and sets it on the Hono context
 * as "requestId". Passes through an incoming X-Request-ID header if it is
 * safe (alphanumeric + hyphens/underscores/dots, ≤ 64 chars) so that clients
 * and upstream proxies can supply their own correlation IDs.
 *
 * The structured-audit-log middleware reads c.get("requestId"), so this
 * middleware must run before any audit logging.
 */

import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";

const REQUEST_ID_HEADER = "X-Request-ID";

/** Accept only safe characters to prevent header injection via the echo. */
const SAFE_ID_RE = /^[a-zA-Z0-9\-_.]{1,64}$/;

export const requestId: MiddlewareHandler = async (c, next) => {
  const incoming = c.req.header(REQUEST_ID_HEADER);
  const id = incoming && SAFE_ID_RE.test(incoming) ? incoming : randomUUID();

  c.set("requestId", id);
  c.header(REQUEST_ID_HEADER, id);

  await next();
};
