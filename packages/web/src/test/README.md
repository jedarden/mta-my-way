# Writing web tests

Place `*.test.ts` or `*.test.tsx` beside the hook or component under test. Vitest runs these tests in jsdom and loads [`setup.ts`](./setup.ts): it installs Testing Library matchers, clears Vitest mocks and Cache Storage before each test, and cleans up rendered React trees after each test. Tests that use fake timers or replace browser globals must restore those changes themselves.

[`factories.ts`](./factories.ts) contains typed builders for favorites, commutes, alerts, arrivals, route recommendations, line diagrams, feed health, and Zustand store states. Pass only fields relevant to the case as overrides. Defaults containing timestamps use the current clock, so set a fixed time with `vi.setSystemTime` when exact times matter. Store builders provide `vi.fn()` actions that can be asserted or overridden.

| Builder | Test data |
| --- | --- |
| `makeFavorite`, `makeCommute`, `makeTapEvent` | Saved stations, commute presets, and favorite-tap history. |
| `makeStationAlert`, `makeLineHealth`, `makeFeedHealth` | Service alerts and health displays. |
| `makeTrainPosition`, `makeLineDiagram`, `makeArrival` | Map, line diagram, and arrival data. |
| `makeDirectRoute`, `makeTransferLeg`, `makeTransferRoute` | Route alternatives and transfer legs. |
| `makeRecommendationDetails`, `makeCommuteAnalysis` | A complete commute recommendation response. |
| `makeFavoritesState`, `makeSettingsState` | Complete store snapshots with action spies. |

## Component pattern

For a test beside `src/components/health/DataHealth.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { makeFeedHealth } from "../../test/factories";
import { DataHealth } from "./DataHealth";

it("shows the feed name", () => {
  render(<DataHealth feeds={[makeFeedHealth({ name: "G Line Feed" })]} />);
  expect(screen.getByText("G Line Feed")).toBeInTheDocument();
});
```

Use `userEvent.setup()` for user interaction and `renderHook` for hooks. Mock only the dependencies that keep the test from exercising the behavior in question. For a store-backed hook, build a complete state with `makeFavoritesState({ favorites: [makeFavorite()] })` and return it from a mocked store selector; see `useMorningBriefing.test.ts` for the current pattern.

## Browser API and PWA helpers

`setup.ts` installs `mockCacheStorage` as `global.caches`. Call `await caches.open("name")` to exercise cache code; the setup resets all cache data before each test. It also exports `mockRegisterSW`, a `vi.fn()` stub for the setup-level `virtual:pwa-register` mock, and mocks `serviceWorkerRegistration` exports.

[`mocks/pwa-register.ts`](./mocks/pwa-register.ts) is the callable PWA registration mock used by the Vitest alias. It captures the last registration options in `registerSW._mockOptions` and exposes `triggerOnRegistered`, `triggerOnRegisterError`, `triggerOnNeedRefresh`, and `triggerOnOfflineReady`. Call `registerSW.mockReset()` when directly testing that mock. The current `serviceWorkerRegistration.test.ts` suite is skipped; use it as a callback-shape reference only.

Run a focused test with `npx vitest run packages/web/src/path/to/file.test.tsx`; run `npm test` and `npm run lint` before delivery.
