/**
 * Browser shim for `node:async_hooks`.
 *
 * `@mta-my-way/shared` re-exports its Node-only tracer from the package
 * barrel, so the browser bundle has to resolve `AsyncLocalStorage` even
 * though the client never calls into it — the web app ships its own tracer
 * in `src/lib/tracing.ts`. Without this shim rollup fails to link the named
 * export out of Vite's empty browser-external stub and the build dies.
 *
 * Only the members the shared tracer touches are implemented. They degrade to
 * plain synchronous execution, which is the right behaviour in a browser where
 * there is no request-scoped async context to isolate.
 */
export class AsyncLocalStorage<T> {
  private store: T | undefined;

  /** Run `callback` with `store` as the active context, restoring afterwards. */
  run<R>(store: T, callback: () => R): R {
    const previous = this.store;
    this.store = store;
    try {
      return callback();
    } finally {
      this.store = previous;
    }
  }

  /** The active context, or undefined outside `run`. */
  getStore(): T | undefined {
    return this.store;
  }

  /** Replace the active context for the current synchronous execution. */
  enterWith(store: T): void {
    this.store = store;
  }

  /** Stop tracking context. */
  disable(): void {
    this.store = undefined;
  }
}
