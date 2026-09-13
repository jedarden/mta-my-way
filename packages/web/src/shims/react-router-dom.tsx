/**
 * Browser shim for `react-router-dom` (bundle trim-back, mtamyway-9b7b2a4f).
 *
 * The app's routing needs are small: a flat route table rendered through
 * <Routes>/<Route>, five hooks, and two link components. react-router-dom v7
 * answers those with its full data router — loaders, actions, fetchers, view
 * transitions, partial-path resolution — which measured 12.7KB gzipped of the
 * shipped bundle. This module implements exactly the surface the app touches
 * and nothing more; `resolve.alias` maps the `react-router-dom` specifier
 * here (same pattern as the `node:async_hooks` shim), so no source file
 * changes and the real library never enters the build graph. TypeScript keeps
 * resolving the real package's .d.ts for call sites, so call sites still
 * typecheck against the react-router API contract this module must honour.
 *
 * Implemented (audited call sites, 2026-09-13):
 * - <BrowserRouter>, <MemoryRouter initialEntries={[...]}>
 * - <Routes> / <Route path element>, <Navigate to replace>
 * - <Link to onClick className ...rest>, <NavLink to className(({isActive, isPending}) => …)>
 * - useLocation().pathname / search / hash / state
 * - useNavigate("/absolute/path" | -1, { replace?, state? })
 * - useParams(), useSearchParams().get()
 *
 * Deliberately unsupported — nothing in the app imports it, and importing it
 * from this module yields `undefined` (which fails loudly on first use):
 * nested routes/Outlet, loaders/actions and the whole data-router API,
 * relative-path resolution (every `to` in the app is absolute), scroll
 * restoration, <Await>/<Form>/fetchers. If a future feature needs one of
 * those, take the dependency back instead of growing this shim.
 */

import {
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

/** The slice of the location object the app reads. */
export interface RouterLocation {
  pathname: string;
  /** Includes the leading "?" when present, so it composes as `${pathname}${search}`. */
  search: string;
  /** Includes the leading "#" when present. */
  hash: string;
  state: unknown;
  key: string;
}

interface NavigateOptions {
  replace?: boolean;
  state?: unknown;
}

type NavigateFn = (to: string | number, options?: NavigateOptions) => void;

/** The object a router puts in context; hooks read it, nothing else does. */
interface Router {
  /** Stable-until-next-navigation location snapshot for useSyncExternalStore. */
  getLocation: () => RouterLocation;
  subscribe: (listener: () => void) => () => void;
  navigate: NavigateFn;
}

const RouterContext = createContext<Router | null>(null);
const ParamsContext = createContext<Record<string, string>>({});

let keyCounter = 0;
const nextKey = () => `r${(keyCounter++).toString(36)}`;

/** Splits an absolute href into its pathname, search and hash parts. */
function parseHref(href: string): Pick<RouterLocation, "pathname" | "search" | "hash"> {
  let pathname = href;
  let search = "";
  let hash = "";
  const hashAt = href.indexOf("#");
  if (hashAt >= 0) {
    hash = href.slice(hashAt);
    pathname = href.slice(0, hashAt);
  }
  const searchAt = pathname.indexOf("?");
  if (searchAt >= 0) {
    search = pathname.slice(searchAt);
    pathname = pathname.slice(0, searchAt);
  }
  // Relative `to` values are not supported (see header): every call site is
  // absolute. Land anything else at the root rather than corrupting the URL.
  if (!pathname.startsWith("/")) pathname = "/";
  return { pathname, search, hash };
}

function locationFromHref(href: string, state: unknown, key: string): RouterLocation {
  return { ...parseHref(href), state, key };
}

/**
 * History backed by window.history. pushState does not fire popstate, so
 * programmatic navigations notify subscribers directly; the popstate listener
 * covers back/forward (and other tabs' history entries).
 */
function createBrowserHistory(): Router {
  const readLocation = (): RouterLocation => {
    const st = window.history.state as { usr?: unknown; key?: string } | null;
    return {
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
      state: st?.usr ?? null,
      key: st?.key ?? "initial",
    };
  };

  const listeners = new Set<() => void>();
  let current = readLocation();

  const apply = (href: string, state: unknown, replace: boolean) => {
    const { pathname, search, hash } = parseHref(href);
    const url = `${pathname}${search}${hash}`;
    const key = nextKey();
    if (replace) window.history.replaceState({ usr: state, key }, "", url);
    else window.history.pushState({ usr: state, key }, "", url);
    current = { pathname, search, hash, state, key };
    listeners.forEach((fn) => fn());
  };

  window.addEventListener("popstate", () => {
    current = readLocation();
    listeners.forEach((fn) => fn());
  });

  return {
    getLocation: () => current,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    navigate: (to, options = {}) => {
      if (typeof to === "number") {
        window.history.go(to);
        return;
      }
      apply(to, options.state, options.replace === true);
    },
  };
}

/** In-memory history for tests and stories; mirrors the browser router's API. */
function createMemoryHistory(initialEntries: string[]): Router {
  const first = locationFromHref(initialEntries[0] ?? "/", null, nextKey());
  const entries: RouterLocation[] = [first];
  let index = 0;
  // Mirrors createBrowserHistory: a `current` snapshot kept in sync with the
  // stack, so getLocation never hands back an index-derived `undefined`.
  let current: RouterLocation = first;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((fn) => fn());

  const moveTo = (href: string, state: unknown, replace: boolean) => {
    const location = locationFromHref(href, state, nextKey());
    if (replace) entries[index] = location;
    else {
      entries.splice(index + 1);
      entries.push(location);
      index = entries.length - 1;
    }
    current = location;
    emit();
  };

  return {
    getLocation: () => current,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    navigate: (to, options = {}) => {
      if (typeof to === "number") {
        const target = index + to;
        const next = entries[target];
        if (next === undefined) return;
        index = target;
        current = next;
        emit();
        return;
      }
      moveTo(to, options.state, options.replace === true);
    },
  };
}

const useRouter = (): Router => {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error("Router hooks may be used only in the context of a <BrowserRouter>.");
  }
  return router;
};

/** Current location; re-renders only when it actually changes. */
export function useLocation(): RouterLocation {
  const router = useRouter();
  return useSyncExternalStore(router.subscribe, router.getLocation);
}

/** Programmatic navigation. A number navigates history by delta (-1 = back). */
export function useNavigate(): NavigateFn {
  return useRouter().navigate;
}

/** Route parameters (`:id` segments) captured by the enclosing <Route>. */
export function useParams(): Readonly<Record<string, string>> {
  return useContext(ParamsContext);
}

/** Query-string reader (plus a setter for parity; the app only reads). */
export function useSearchParams(): [
  URLSearchParams,
  (next: string | URLSearchParams | Record<string, string>, options?: NavigateOptions) => void,
] {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const setSearchParams = useCallback(
    (next: string | URLSearchParams | Record<string, string>, options?: NavigateOptions) => {
      const qs =
        next instanceof URLSearchParams
          ? next.toString()
          : typeof next === "string"
            ? next.replace(/^\?/, "")
            : new URLSearchParams(next).toString();
      navigate(`${pathname}?${qs}`, options);
    },
    [navigate, pathname]
  );
  return [params, setSearchParams];
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** Splits a path into segments, dropping empty ones ("/a/" and "/a" match alike). */
const segments = (path: string): string[] => path.split("/").filter((s) => s.length > 0);

/**
 * Matches `pathname` against a flat route pattern: static segments must be
 * equal, `:name` captures one segment, and a trailing `*` consumes the rest.
 * Returns the captured params, or null when the pattern does not match.
 */
function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const patternSegs = segments(pattern);
  const pathSegs = segments(pathname);
  const hasSplat = patternSegs[patternSegs.length - 1] === "*";
  if (!hasSplat && patternSegs.length !== pathSegs.length) return null;
  if (hasSplat && pathSegs.length < patternSegs.length - 1) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternSegs.length; i++) {
    const seg = patternSegs[i];
    // Unreachable given the loop bounds; noUncheckedIndexedAccess wants it.
    if (seg === undefined) return null;
    if (seg === "*") return params;
    const actual = pathSegs[i];
    if (actual === undefined) return null;
    if (seg.startsWith(":")) params[seg.slice(1)] = decodeURIComponent(actual);
    else if (seg !== actual) return null;
  }
  return params;
}

/**
 * Route ranking, matching react-router's semantics: static segments beat
 * params, and a catch-all loses to everything — so "/reset-password/confirm"
 * wins over "/:id", and "*" only fires when nothing else matched.
 */
function specificity(pattern: string): number {
  const segs = segments(pattern);
  if (segs[segs.length - 1] === "*") return -1;
  return segs.reduce((score, seg) => score + (seg.startsWith(":") ? 1 : 2), 0);
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/** Declares a route; <Routes> reads these out of its children. */
export function Route(_props: { path?: string; element?: ReactNode; children?: ReactNode }): null {
  // Route is declarative data, never rendered: <Routes> walks its children.
  return null;
}

interface RouteData {
  path: string;
  element: ReactNode;
}

function collectRoutes(children: ReactNode): RouteData[] {
  const routes: RouteData[] = [];
  for (const child of Array.isArray(children) ? children : [children]) {
    if (!child || typeof child !== "object" || !("props" in child)) continue;
    const props = (child as { props?: { path?: string; element?: ReactNode } }).props;
    if (props?.element === undefined) continue;
    routes.push({ path: props.path ?? "/", element: props.element });
  }
  return routes;
}

/** Renders the highest-specificity <Route> matching the current pathname. */
export function Routes({ children }: { children?: ReactNode }): ReactNode {
  const { pathname } = useLocation();
  let best: { element: ReactNode; params: Record<string, string>; score: number } | null = null;
  for (const route of collectRoutes(children)) {
    const params = matchPath(route.path, pathname);
    if (!params) continue;
    const score = specificity(route.path);
    if (!best || score > best.score) best = { element: route.element, params, score };
  }
  if (!best) return null;
  const { Provider } = ParamsContext;
  return <Provider value={best.params}>{best.element}</Provider>;
}

/**
 * Redirect rendered as an element: performs the navigation once mounted and
 * renders nothing. Used by the catch-all route that sends unknown URLs home.
 */
export function Navigate({
  to,
  replace,
  state,
}: {
  to: string;
  replace?: boolean;
  state?: unknown;
}): null {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, { replace, state });
  }, [navigate, to, replace, state]);
  return null;
}

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  to: string;
  replace?: boolean;
  state?: unknown;
}

/**
 * An <a> that intercepts plain left clicks and navigates in-app. Modified
 * clicks (cmd/ctrl/shift) and non-_self targets fall through to the browser,
 * so open-in-new-tab keeps working.
 */
export function Link({ to, replace, state, onClick, target, children, ...rest }: LinkProps) {
  const navigate = useNavigate();
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    if (target && target !== "_self") return;
    event.preventDefault();
    navigate(to, { replace, state });
  };
  return (
    <a {...rest} href={to} target={target} onClick={handleClick}>
      {children}
    </a>
  );
}

/**
 * Link with active-state styling. `className` accepts the react-router
 * render-prop form; `isActive` follows the exact upstream rule —
 * `pathname === to`, or (without `end`) `pathname.startsWith(to + "/")` —
 * which incidentally keeps a to="/" link inactive everywhere but the root,
 * because "/search" does not start with "//".
 */
export function NavLink({
  to,
  className,
  children,
  ...rest
}: Omit<LinkProps, "replace" | "state" | "className"> & {
  // className must be re-declared on a type that has actually omitted it:
  // LinkProps inherits `className?: string` from AnchorHTMLAttributes, and
  // intersecting that with the render-prop form below would collapse the
  // property to `string`, making the function form `never`.
  className?:
    | string
    | ((args: { isActive: boolean; isPending: boolean; isTransitioning: boolean }) => string);
}) {
  const { pathname } = useLocation();
  const isActive = pathname === to || pathname.startsWith(`${to}/`);
  const resolvedClass =
    typeof className === "function"
      ? className({ isActive, isPending: false, isTransitioning: false })
      : className;
  return (
    <Link {...rest} to={to} className={resolvedClass} aria-current={isActive ? "page" : undefined}>
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Routers
// ---------------------------------------------------------------------------

/** Routes against the real browser URL (window.history + popstate). */
export function BrowserRouter({ children }: { children?: ReactNode }) {
  const [router] = useState(createBrowserHistory);
  return <RouterContext.Provider value={router}>{children}</RouterContext.Provider>;
}

/** Routes against an in-memory history stack; what the test suites wrap in. */
export function MemoryRouter({
  children,
  initialEntries,
}: {
  children?: ReactNode;
  initialEntries?: string[];
}) {
  const [entries] = useState(() => initialEntries ?? ["/"]);
  const [router] = useState(() => createMemoryHistory(entries));
  return <RouterContext.Provider value={router}>{children}</RouterContext.Provider>;
}
