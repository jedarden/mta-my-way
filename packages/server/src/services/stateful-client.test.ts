/**
 * Tests for the stateful subsystem client (services/stateful-client.ts).
 *
 * Covers the circuit breaker contract documented on the module:
 * - opens after CIRCUIT_OPEN_AFTER = 3 consecutive failures
 * - stays open until CIRCUIT_RESET_MS = 60s has elapsed
 * - half-open: exactly one probe in flight decides recovery — concurrent and
 *   sequential callers fail fast until it settles, and a failed probe re-arms
 *   the full open window before the next probe
 * - default 2000ms request timeout (STATEFUL_TIMEOUT_MS override)
 * - STATEFUL_SERVICE_URL discovery (default http://mta-my-way-stateful:3001)
 *
 * The client reads its env configuration and initializes its circuit state at
 * module load, so every test loads a fresh module instance via
 * vi.resetModules() + dynamic import with the env it wants.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STATEFUL_ENV_KEYS = ["STATEFUL_SERVICE_URL", "STATEFUL_TIMEOUT_MS"] as const;

// Keep the module's log noise out of the test output.
vi.mock("../observability/index.js", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

/** A Response the client treats as success. */
function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    statusText: "OK",
    headers: { "Content-Type": "application/json" },
  });
}

/** A Response the client treats as failure (non-2xx). */
function errorResponse(status: number, statusText: string): Response {
  return new Response(null, { status, statusText });
}

/**
 * A fetch that never resolves on its own and rejects with an AbortError when
 * the client's timeout aborts its signal — the observable shape of a hung
 * upstream under real fetch.
 */
function hangingFetch(): ReturnType<typeof vi.fn> {
  return vi.fn((_url: string | URL, init?: RequestInit): Promise<Response> => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const abortError = new Error("This operation was aborted");
        abortError.name = "AbortError";
        reject(abortError);
      });
    });
  });
}

/**
 * Load a fresh instance of the client with the given env applied on top of a
 * clean STATEFUL_* environment.
 */
async function loadClient(env: Record<string, string> = {}) {
  vi.resetModules();
  for (const key of STATEFUL_ENV_KEYS) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }
  return import("./stateful-client.js");
}

/** One manually-resolvable in-flight request captured by deferredFetch. */
interface DeferredResponse {
  promise: Promise<Response>;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
}

/**
 * A fetch whose response is supplied manually per call, so a test can hold the
 * half-open probe in flight while asserting on concurrent callers.
 */
function deferredFetch(): { fetchMock: ReturnType<typeof vi.fn>; calls: DeferredResponse[] } {
  const calls: DeferredResponse[] = [];
  const fetchMock = vi.fn((_url: string | URL, _init?: RequestInit): Promise<Response> => {
    let resolve!: (response: Response) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<Response>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    calls.push({ promise, resolve, reject });
    return promise;
  });
  return { fetchMock, calls };
}

describe("stateful-client", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    for (const key of STATEFUL_ENV_KEYS) {
      delete process.env[key];
    }
  });

  describe("STATEFUL_SERVICE_URL discovery", () => {
    it("defaults to the in-cluster stateful Service URL", async () => {
      const client = await loadClient();
      const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
        okResponse({ status: "ok" })
      );
      vi.stubGlobal("fetch", fetchMock);

      await expect(client.callStatefulService("/api/test")).resolves.toEqual({ status: "ok" });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe("http://mta-my-way-stateful:3001/api/test");
      expect(client.getStatefulStatus().serviceUrl).toBe("http://mta-my-way-stateful:3001");
    });

    it("uses STATEFUL_SERVICE_URL when set", async () => {
      const client = await loadClient({ STATEFUL_SERVICE_URL: "http://stateful.test:9999" });
      const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
        okResponse({ status: "ok" })
      );
      vi.stubGlobal("fetch", fetchMock);

      await expect(client.callStatefulService("/api/test")).resolves.toEqual({ status: "ok" });

      expect(fetchMock.mock.calls[0]?.[0]).toBe("http://stateful.test:9999/api/test");
      expect(client.getStatefulStatus().serviceUrl).toBe("http://stateful.test:9999");
    });

    it("sends JSON content type and forwards the method and body", async () => {
      const client = await loadClient();
      const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
        okResponse({ subscribed: true })
      );
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        client.callStatefulService("/api/push/subscribe", {
          method: "POST",
          body: '{"x":1}',
        })
      ).resolves.toEqual({ subscribed: true });

      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
        method: "POST",
        body: '{"x":1}',
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      });
    });
  });

  describe("request timeout", () => {
    it("aborts a hung request after the default 2000ms", async () => {
      const client = await loadClient();
      const fetchMock = hangingFetch();
      vi.stubGlobal("fetch", fetchMock);

      const pending = client.callStatefulService("/api/slow");
      let outcome = "pending";
      pending.then(
        () => {
          outcome = "resolved";
        },
        () => {
          outcome = "rejected";
        }
      );

      // A tick before the default timeout the request is still in flight.
      await vi.advanceTimersByTimeAsync(1999);
      expect(outcome).toBe("pending");

      await vi.advanceTimersByTimeAsync(1);
      expect(outcome).toBe("rejected");
      await expect(pending).rejects.toThrow("Stateful subsystem timeout (2000ms)");
    });

    it("honors a STATEFUL_TIMEOUT_MS override", async () => {
      const client = await loadClient({ STATEFUL_TIMEOUT_MS: "25" });
      const fetchMock = hangingFetch();
      vi.stubGlobal("fetch", fetchMock);

      const pending = client.callStatefulService("/api/slow");
      let outcome = "pending";
      pending.then(
        () => {
          outcome = "resolved";
        },
        () => {
          outcome = "rejected";
        }
      );

      await vi.advanceTimersByTimeAsync(24);
      expect(outcome).toBe("pending");

      await vi.advanceTimersByTimeAsync(1);
      expect(outcome).toBe("rejected");
      await expect(pending).rejects.toThrow("Stateful subsystem timeout (25ms)");
    });
  });

  describe("circuit breaker", () => {
    it("opens after 3 consecutive failures and fails fast without calling the service", async () => {
      const client = await loadClient();
      const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
        errorResponse(503, "Service Unavailable")
      );
      vi.stubGlobal("fetch", fetchMock);

      // Two failures keep the circuit closed.
      await expect(client.callStatefulService("/api/x")).rejects.toThrow("HTTP 503");
      expect(client.isCircuitOpen()).toBe(false);
      await expect(client.callStatefulService("/api/x")).rejects.toThrow("HTTP 503");
      expect(client.isCircuitOpen()).toBe(false);

      // The third consecutive failure opens it.
      await expect(client.callStatefulService("/api/x")).rejects.toThrow("HTTP 503");
      expect(client.isCircuitOpen()).toBe(true);
      expect(client.getCircuitState().consecutiveFailures).toBe(3);
      expect(client.getCircuitState().circuitOpenAt).not.toBeNull();

      // Requests are now rejected locally; the service is not contacted again.
      const callsWhenOpened = fetchMock.mock.calls.length;
      await expect(client.callStatefulService("/api/x")).rejects.toThrow(
        "Stateful subsystem unavailable - circuit breaker open"
      );
      expect(fetchMock.mock.calls.length).toBe(callsWhenOpened);
    });

    it("does not open on intermittent failures — a success resets the consecutive count", async () => {
      const client = await loadClient();
      let fail = true;
      const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
        fail ? errorResponse(503, "Service Unavailable") : okResponse({ status: "ok" })
      );
      vi.stubGlobal("fetch", fetchMock);

      await expect(client.callStatefulService("/api/x")).rejects.toThrow("HTTP 503");
      await expect(client.callStatefulService("/api/x")).rejects.toThrow("HTTP 503");

      fail = false;
      await expect(client.callStatefulService("/api/x")).resolves.toEqual({ status: "ok" });
      expect(client.getCircuitState().consecutiveFailures).toBe(0);

      fail = true;
      await expect(client.callStatefulService("/api/x")).rejects.toThrow("HTTP 503");
      await expect(client.callStatefulService("/api/x")).rejects.toThrow("HTTP 503");
      expect(client.isCircuitOpen()).toBe(false);
    });

    it("stays open until CIRCUIT_RESET_MS (60s) has elapsed", async () => {
      const client = await loadClient();
      const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
        errorResponse(503, "Service Unavailable")
      );
      vi.stubGlobal("fetch", fetchMock);

      for (let i = 0; i < 3; i++) {
        await expect(client.callStatefulService("/api/x")).rejects.toThrow("HTTP 503");
      }
      expect(client.isCircuitOpen()).toBe(true);

      // Service comes back, but the circuit must not trust it yet.
      fetchMock.mockImplementation(async (_url: string | URL, _init?: RequestInit) =>
        okResponse({ status: "ok" })
      );

      // 59,999ms in, the circuit still rejects without contacting the service.
      await vi.advanceTimersByTimeAsync(59_999);
      const callsBeforeWindow = fetchMock.mock.calls.length;
      await expect(client.callStatefulService("/api/x")).rejects.toThrow("circuit breaker open");
      expect(fetchMock.mock.calls.length).toBe(callsBeforeWindow);

      // One tick later the half-open window begins and the call goes through.
      await vi.advanceTimersByTimeAsync(1);
      await expect(client.callStatefulService("/api/x")).resolves.toEqual({ status: "ok" });
    });

    it("half-open: a single successful probe closes the circuit", async () => {
      const client = await loadClient();
      const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
        errorResponse(503, "Service Unavailable")
      );
      vi.stubGlobal("fetch", fetchMock);

      for (let i = 0; i < 3; i++) {
        await expect(client.callStatefulService("/api/x")).rejects.toThrow("HTTP 503");
      }
      expect(client.isCircuitOpen()).toBe(true);

      fetchMock.mockImplementation(async (_url: string | URL, _init?: RequestInit) =>
        okResponse({ status: "ok" })
      );
      await vi.advanceTimersByTimeAsync(60_000);

      await expect(client.callStatefulService("/api/probe")).resolves.toEqual({ status: "ok" });

      const state = client.getCircuitState();
      expect(state.circuitOpenAt).toBeNull();
      expect(state.consecutiveFailures).toBe(0);
      expect(state.lastSuccessAt).not.toBeNull();
      expect(client.isCircuitOpen()).toBe(false);
      expect(client.getStatefulStatus().reachable).toBe(true);
    });

    it("half-open: a failed probe keeps the circuit open", async () => {
      const client = await loadClient();
      const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
        errorResponse(503, "Service Unavailable")
      );
      vi.stubGlobal("fetch", fetchMock);

      for (let i = 0; i < 3; i++) {
        await expect(client.callStatefulService("/api/x")).rejects.toThrow("HTTP 503");
      }
      await vi.advanceTimersByTimeAsync(60_000);

      // The probe itself is allowed through and fails.
      await expect(client.callStatefulService("/api/probe")).rejects.toThrow("HTTP 503");
      expect(client.isCircuitOpen()).toBe(true);
      expect(client.getCircuitState().consecutiveFailures).toBe(4);
      expect(client.getCircuitState().lastError).toContain("HTTP 503");
    });

    it("half-open: only one probe is in flight — concurrent callers fail fast", async () => {
      const client = await loadClient();
      const failing = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
        errorResponse(503, "Service Unavailable")
      );
      vi.stubGlobal("fetch", failing);

      for (let i = 0; i < 3; i++) {
        await expect(client.callStatefulService("/api/x")).rejects.toThrow("HTTP 503");
      }
      expect(client.isCircuitOpen()).toBe(true);

      const { fetchMock, calls } = deferredFetch();
      vi.stubGlobal("fetch", fetchMock);
      await vi.advanceTimersByTimeAsync(60_000);

      // The first call past the window becomes the in-flight probe.
      const probe = client.callStatefulService<{ status: string }>("/api/probe");
      expect(calls.length).toBe(1);

      // A caller racing the probe is rejected locally — the service is not
      // contacted a second time while the probe is outstanding.
      await expect(client.callStatefulService("/api/other")).rejects.toThrow(
        "circuit breaker open"
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(calls.length).toBe(1);

      // The probe settles successfully and closes the circuit.
      calls[0]?.resolve(okResponse({ status: "ok" }));
      await expect(probe).resolves.toEqual({ status: "ok" });
      expect(client.isCircuitOpen()).toBe(false);
    });

    it("half-open: a failed probe re-arms the open window — no new probe until another full reset", async () => {
      const client = await loadClient();
      const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
        errorResponse(503, "Service Unavailable")
      );
      vi.stubGlobal("fetch", fetchMock);

      for (let i = 0; i < 3; i++) {
        await expect(client.callStatefulService("/api/x")).rejects.toThrow("HTTP 503");
      }
      const firstOpenAt = client.getCircuitState().circuitOpenAt ?? 0;
      await vi.advanceTimersByTimeAsync(60_000);

      // The probe goes through and fails...
      await expect(client.callStatefulService("/api/probe")).rejects.toThrow("HTTP 503");
      expect(client.isCircuitOpen()).toBe(true);
      expect(client.getCircuitState().consecutiveFailures).toBe(4);
      // ...and the open window is re-armed from now, not left at the original stamp.
      expect(client.getCircuitState().circuitOpenAt ?? 0).toBeGreaterThan(firstOpenAt);

      // So the next caller fails fast instead of being admitted as a fresh probe.
      const callsAfterProbe = fetchMock.mock.calls.length;
      await expect(client.callStatefulService("/api/x")).rejects.toThrow("circuit breaker open");
      expect(fetchMock.mock.calls.length).toBe(callsAfterProbe);

      // Still failing fast 59,999ms into the re-armed window...
      await vi.advanceTimersByTimeAsync(59_999);
      await expect(client.callStatefulService("/api/x")).rejects.toThrow("circuit breaker open");
      expect(fetchMock.mock.calls.length).toBe(callsAfterProbe);

      // ...and one tick later a fresh probe is admitted and recovers the service.
      fetchMock.mockImplementation(async (_url: string | URL, _init?: RequestInit) =>
        okResponse({ status: "ok" })
      );
      await vi.advanceTimersByTimeAsync(1);
      await expect(client.callStatefulService("/api/probe")).resolves.toEqual({ status: "ok" });
      expect(client.isCircuitOpen()).toBe(false);
    });

    it("logs the recovery attempt once per window, not on every call or status poll", async () => {
      const client = await loadClient();
      // Import through the fresh module registry so this is the same mocked
      // logger instance the freshly-loaded client bound.
      const { logger } = await import("../observability/index.js");
      const infoMock = vi.mocked(logger.info);
      const recoveryCalls = () =>
        infoMock.mock.calls.filter((args) =>
          String(args[0]).includes("reset - attempting recovery")
        );

      const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
        errorResponse(503, "Service Unavailable")
      );
      vi.stubGlobal("fetch", fetchMock);

      for (let i = 0; i < 3; i++) {
        await expect(client.callStatefulService("/api/x")).rejects.toThrow("HTTP 503");
      }
      await vi.advanceTimersByTimeAsync(60_000);

      // Polling the circuit state must not log the recovery attempt...
      client.isCircuitOpen();
      client.getStatefulStatus();
      expect(recoveryCalls().length).toBe(0);

      // ...the admitted probe logs it exactly once...
      const { fetchMock: deferredMock, calls } = deferredFetch();
      vi.stubGlobal("fetch", deferredMock);
      const probe = client.callStatefulService<{ status: string }>("/api/probe");
      expect(recoveryCalls().length).toBe(1);

      // ...and callers rejected while the probe is in flight do not log it again.
      await expect(client.callStatefulService("/api/other")).rejects.toThrow(
        "circuit breaker open"
      );
      expect(recoveryCalls().length).toBe(1);

      calls[0]?.resolve(okResponse({ status: "ok" }));
      await expect(probe).resolves.toEqual({ status: "ok" });
    });
  });

  describe("checkStatefulHealth", () => {
    it("returns true when the stateful /healthz answers ok", async () => {
      const client = await loadClient();
      const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
        okResponse({ status: "ok" })
      );
      vi.stubGlobal("fetch", fetchMock);

      await expect(client.checkStatefulHealth()).resolves.toBe(true);
      expect(fetchMock.mock.calls[0]?.[0]).toBe("http://mta-my-way-stateful:3001/healthz");
    });

    it("returns false when the stateful service cannot be reached", async () => {
      const client = await loadClient();
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string | URL, _init?: RequestInit): Promise<Response> => {
          throw new Error("connect ECONNREFUSED 10.0.0.1:3001");
        })
      );
      await expect(client.checkStatefulHealth()).resolves.toBe(false);
    });
  });

  describe("getStatefulStatus", () => {
    it("reports reachable only within 30s of the last success", async () => {
      const client = await loadClient();
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string | URL, _init?: RequestInit) => okResponse({ status: "ok" }))
      );

      expect(client.getStatefulStatus().reachable).toBe(null);
      expect(client.getStatefulStatus().circuitOpen).toBe(false);

      await client.callStatefulService("/api/x");
      expect(client.getStatefulStatus().reachable).toBe(true);

      await vi.advanceTimersByTimeAsync(30_001);
      expect(client.getStatefulStatus().reachable).toBe(false);
    });
  });
});
