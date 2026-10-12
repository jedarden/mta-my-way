/**
 * Import smoke tests for the public module barrels.
 *
 * Each barrel re-exports a package's public surface; executing it verifies
 * the re-export graph resolves (catches circular-import and renamed-symbol
 * breakage) and pins the expected export names.
 */

import { describe, expect, it } from "vitest";
import * as alerts from "./components/alerts";
import * as arrivals from "./components/arrivals";
import * as commute from "./components/commute";
import * as diagram from "./components/diagram";
import * as favorites from "./components/favorites";
import * as health from "./components/health";
import * as layout from "./components/layout";
import * as hooks from "./hooks";
import * as screens from "./screens";

describe("module barrels", () => {
  it("screens barrel exports every shipped screen", () => {
    expect(Object.keys(screens).sort()).toEqual(
      [
        "AlertsScreen",
        "CommuteScreen",
        "HomeScreen",
        "MapScreen",
        "SearchScreen",
        "SettingsScreen",
        "StationScreen",
      ].sort()
    );
  });

  it("hooks barrel exports the core data hooks", () => {
    for (const name of [
      "useArrivals",
      "useAlerts",
      "useCommute",
      "useErrorHandler",
      "useFavorites",
      "useGeofence",
      "useIntersectionObserver",
      "useMorningBriefing",
      "useOnlineStatus",
      "usePositions",
      "usePrefetch",
      "usePushNotifications",
      "useStaleness",
    ]) {
      expect(hooks, `hooks barrel missing ${name}`).toHaveProperty(name);
    }
  });

  it("component barrels export their members", () => {
    expect(Object.keys(alerts).length).toBeGreaterThan(0);
    expect(Object.keys(arrivals).length).toBeGreaterThan(0);
    expect(Object.keys(commute).length).toBeGreaterThan(0);
    expect(Object.keys(diagram).length).toBeGreaterThan(0);
    expect(Object.keys(favorites).length).toBeGreaterThan(0);
    expect(Object.keys(health).length).toBeGreaterThan(0);
    expect(Object.keys(layout).length).toBeGreaterThan(0);
  });
});
