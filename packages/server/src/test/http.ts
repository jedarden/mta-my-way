/**
 * Test utilities for HTTP operations.
 */

import type { Context } from "hono";
import { vi } from "vitest";

/**
 * Create a mock HTTP request.
 */
export function createMockRequest(options: {
  method?: string;
  url?: string;
  path?: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
}): Context["req"] {
  const {
    method = "GET",
    url = "http://localhost/test",
    path = "/test",
    headers = {},
    query = {},
    body = null,
  } = options;

  const req = {
    method,
    url,
    path,
    header: vi.fn((name: string) => {
      const headerName = Object.keys(headers).find((h) => h.toLowerCase() === name.toLowerCase());
      return headerName ? headers[headerName]! : null;
    }),
    query: vi.fn(() => query),
    param: vi.fn(),
    json: vi.fn(async () => body),
    formData: vi.fn(async () => body),
    body: vi.fn(async () => JSON.stringify(body)),
  } as unknown as Context["req"];

  return req;
}

/**
 * Create a mock HTTP response.
 */
export function createMockResponse(): {
  res: Context["res"];
  getStatus: () => number;
  getHeaders: () => Headers;
  getBody: () => unknown;
  mockStatus: ReturnType<typeof vi.fn>;
  mockJson: ReturnType<typeof vi.fn>;
  mockText: ReturnType<typeof vi.fn>;
  mockHeader: ReturnType<typeof vi.fn>;
} {
  let status = 200;
  const headers = new Headers();
  let body: unknown = null;

  const mockStatus = vi.fn((s: number) => {
    status = s;
    return res;
  });
  const mockJson = vi.fn((b: unknown) => {
    body = b;
    return new Response(JSON.stringify(b));
  });
  const mockText = vi.fn((b: string) => {
    body = b;
    return new Response(b);
  });
  const mockHeader = vi.fn((name: string, value: string) => {
    headers.set(name, value);
  });

  const res = {
    status: mockStatus,
    json: mockJson,
    text: mockText,
    headers,
    get headers() {
      return headers;
    },
  } as unknown as Context["res"];

  return {
    res,
    getStatus: () => status,
    getHeaders: () => headers,
    getBody: () => body,
    mockStatus,
    mockJson,
    mockText,
    mockHeader,
  };
}

/**
 * Create a mock Hono context.
 */
export function createMockHonoContext(options: {
  method?: string;
  url?: string;
  path?: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  params?: Record<string, string>;
}): Context {
  const req = createMockRequest(options);
  const { res, getStatus, getHeaders, getBody } = createMockResponse();

  const context = {
    req,
    res,
    get: vi.fn((key: string) => undefined),
    set: vi.fn((key: string, value: unknown) => {}),
    header: vi.fn((name: string, value: string) => {
      res.headers.set(name, value);
    }),
    status: vi.fn((code: number) => {
      return context as unknown as Context;
    }),
    json: vi.fn((body: unknown) => {
      return new Response(JSON.stringify(body));
    }),
    text: vi.fn((body: string) => {
      return new Response(body);
    }),
    // Convenience methods for testing
    _test: {
      getStatus,
      getHeaders,
      getBody,
    },
  } as unknown as Context;

  return context;
}

/**
 * Assert response status code.
 */
export function assertResponseStatus(context: Context, expectedStatus: number): void {
  const status = (context.res as Response & { status?: number }).status;
  if (status !== expectedStatus) {
    throw new Error(`Expected status ${expectedStatus}, but got ${status}`);
  }
}

/**
 * Assert response header value.
 */
export function assertResponseHeader(context: Context, name: string, expectedValue?: string): void {
  const headers = context.res.headers || new Headers();
  const value = headers.get(name);

  if (!value) {
    throw new Error(`Expected header '${name}' to be set`);
  }

  if (expectedValue && value !== expectedValue) {
    throw new Error(`Expected header '${name}' to be '${expectedValue}', but got '${value}'`);
  }
}

/**
 * Assert response body contains text.
 */
export function assertResponseBody(context: Context, expectedText: string): void {
  // Note: This is a simplified check - in real scenarios you'd need to
  // parse the response body
  const body = (context.res as Response & { _bodyText?: string })._bodyText;
  if (!body || !body.includes(expectedText)) {
    throw new Error(`Expected response body to contain '${expectedText}'`);
  }
}

/**
 * Parse JSON response body.
 */
export async function parseJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  return JSON.parse(text);
}

/**
 * Assert JSON response body.
 */
export async function assertJsonBody(
  response: Response,
  expectedBody: Record<string, unknown>
): Promise<void> {
  const body = (await parseJsonBody(response)) as Record<string, unknown>;

  for (const [key, value] of Object.entries(expectedBody)) {
    if (body[key] !== value) {
      throw new Error(
        `Expected body.${key} to be ${JSON.stringify(value)}, but got ${JSON.stringify(body[key])}`
      );
    }
  }
}

/**
 * Assert response is a redirect.
 */
export function assertRedirect(response: Response, expectedLocation?: string): void {
  if (response.status < 300 || response.status >= 400) {
    throw new Error(`Expected redirect status (3xx), but got ${response.status}`);
  }

  const location = response.headers.get("Location");
  if (!location) {
    throw new Error("Expected redirect response to have Location header");
  }

  if (expectedLocation && location !== expectedLocation) {
    throw new Error(`Expected redirect to '${expectedLocation}', but got '${location}'`);
  }
}

/**
 * Assert content type header.
 */
export function assertContentType(response: Response, expectedType: string): void {
  const contentType = response.headers.get("Content-Type");

  if (!contentType) {
    throw new Error("Expected Content-Type header to be set");
  }

  if (!contentType.includes(expectedType)) {
    throw new Error(`Expected Content-Type to include '${expectedType}', but got '${contentType}'`);
  }
}

/**
 * Create a fetch mock for testing.
 */
export function createFetchMock(
  responses: Array<{
    url: string | RegExp;
    response: Response | Error;
    method?: string;
  }>
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method || "GET";

    for (const mock of responses) {
      const urlMatches =
        typeof mock.url === "string"
          ? url.includes(mock.url)
          : mock.url instanceof RegExp
            ? mock.url.test(url)
            : false;

      const methodMatches = !mock.method || mock.method === method;

      if (urlMatches && methodMatches) {
        if (mock.response instanceof Error) {
          throw mock.response;
        }
        return mock.response.clone();
      }
    }

    throw new Error(`No mock response found for ${method} ${url}`);
  };
}

/**
 * Assert that fetch was called with specific options.
 */
export function assertFetchCalled(
  mock: ReturnType<typeof vi.fn>,
  url: string,
  options?: RequestInit
): void {
  expect(mock).toHaveBeenCalledWith(
    expect.stringContaining(url),
    options ? expect.objectContaining(options) : undefined
  );
}
