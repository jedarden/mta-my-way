/**
 * Tests for settings store.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "./settingsStore";

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

vi.stubGlobal("localStorage", localStorageMock);

describe("settingsStore", () => {
  beforeEach(() => {
    // Reset store before each test
    useSettingsStore.setState({
      theme: "system",
      showUnassignedTrips: false,
      refreshInterval: 30,
      alertSeverityFilter: "delays",
      hapticFeedback: true,
      accessibleMode: false,
      quietHours: { enabled: false, startHour: 22, endHour: 7 },
    });
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("should have default theme set to system", () => {
      const state = useSettingsStore.getState();
      expect(state.theme).toBe("system");
    });

    it("should have showUnassignedTrips set to false by default", () => {
      const state = useSettingsStore.getState();
      expect(state.showUnassignedTrips).toBe(false);
    });

    it("should have refreshInterval set to 30 seconds by default", () => {
      const state = useSettingsStore.getState();
      expect(state.refreshInterval).toBe(30);
    });

    it("should have alertSeverityFilter set to delays by default", () => {
      const state = useSettingsStore.getState();
      expect(state.alertSeverityFilter).toBe("delays");
    });

    it("should have hapticFeedback enabled by default", () => {
      const state = useSettingsStore.getState();
      expect(state.hapticFeedback).toBe(true);
    });

    it("should have accessibleMode disabled by default", () => {
      const state = useSettingsStore.getState();
      expect(state.accessibleMode).toBe(false);
    });

    it("should have quietHours configured but disabled", () => {
      const state = useSettingsStore.getState();
      expect(state.quietHours.enabled).toBe(false);
      expect(state.quietHours.startHour).toBe(22);
      expect(state.quietHours.endHour).toBe(7);
    });
  });

  describe("setTheme", () => {
    it("should set theme to light", () => {
      useSettingsStore.getState().setTheme("light");

      const state = useSettingsStore.getState();
      expect(state.theme).toBe("light");
    });

    it("should set theme to dark", () => {
      useSettingsStore.getState().setTheme("dark");

      const state = useSettingsStore.getState();
      expect(state.theme).toBe("dark");
    });

    it("should set theme to system", () => {
      useSettingsStore.getState().setTheme("system");

      const state = useSettingsStore.getState();
      expect(state.theme).toBe("system");
    });
  });

  describe("setShowUnassignedTrips", () => {
    it("should enable showing unassigned trips", () => {
      useSettingsStore.getState().setShowUnassignedTrips(true);

      const state = useSettingsStore.getState();
      expect(state.showUnassignedTrips).toBe(true);
    });

    it("should disable showing unassigned trips", () => {
      useSettingsStore.getState().setShowUnassignedTrips(false);

      const state = useSettingsStore.getState();
      expect(state.showUnassignedTrips).toBe(false);
    });
  });

  describe("setRefreshInterval", () => {
    it("should set refresh interval", () => {
      useSettingsStore.getState().setRefreshInterval(60);

      const state = useSettingsStore.getState();
      expect(state.refreshInterval).toBe(60);
    });

    it("should enforce minimum of 15 seconds", () => {
      useSettingsStore.getState().setRefreshInterval(5);

      const state = useSettingsStore.getState();
      expect(state.refreshInterval).toBe(15);
    });

    it("should allow 15 seconds", () => {
      useSettingsStore.getState().setRefreshInterval(15);

      const state = useSettingsStore.getState();
      expect(state.refreshInterval).toBe(15);
    });

    it("should allow large values", () => {
      useSettingsStore.getState().setRefreshInterval(300);

      const state = useSettingsStore.getState();
      expect(state.refreshInterval).toBe(300);
    });
  });

  describe("setAlertSeverityFilter", () => {
    it("should set filter to all", () => {
      useSettingsStore.getState().setAlertSeverityFilter("all");

      const state = useSettingsStore.getState();
      expect(state.alertSeverityFilter).toBe("all");
    });

    it("should set filter to delays", () => {
      useSettingsStore.getState().setAlertSeverityFilter("delays");

      const state = useSettingsStore.getState();
      expect(state.alertSeverityFilter).toBe("delays");
    });

    it("should set filter to major", () => {
      useSettingsStore.getState().setAlertSeverityFilter("major");

      const state = useSettingsStore.getState();
      expect(state.alertSeverityFilter).toBe("major");
    });
  });

  describe("setHapticFeedback", () => {
    it("should enable haptic feedback", () => {
      useSettingsStore.getState().setHapticFeedback(true);

      const state = useSettingsStore.getState();
      expect(state.hapticFeedback).toBe(true);
    });

    it("should disable haptic feedback", () => {
      useSettingsStore.getState().setHapticFeedback(false);

      const state = useSettingsStore.getState();
      expect(state.hapticFeedback).toBe(false);
    });
  });

  describe("setAccessibleMode", () => {
    it("should enable accessible mode", () => {
      useSettingsStore.getState().setAccessibleMode(true);

      const state = useSettingsStore.getState();
      expect(state.accessibleMode).toBe(true);
    });

    it("should disable accessible mode", () => {
      useSettingsStore.getState().setAccessibleMode(false);

      const state = useSettingsStore.getState();
      expect(state.accessibleMode).toBe(false);
    });
  });

  describe("setQuietHours", () => {
    it("should set quiet hours configuration", () => {
      const quietHours = {
        enabled: true,
        startHour: 23,
        endHour: 6,
      };

      useSettingsStore.getState().setQuietHours(quietHours);

      const state = useSettingsStore.getState();
      expect(state.quietHours).toEqual(quietHours);
    });

    it("should allow 0 as start hour", () => {
      const quietHours = {
        enabled: true,
        startHour: 0,
        endHour: 6,
      };

      useSettingsStore.getState().setQuietHours(quietHours);

      const state = useSettingsStore.getState();
      expect(state.quietHours.startHour).toBe(0);
    });

    it("should allow 23 as end hour", () => {
      const quietHours = {
        enabled: true,
        startHour: 22,
        endHour: 23,
      };

      useSettingsStore.getState().setQuietHours(quietHours);

      const state = useSettingsStore.getState();
      expect(state.quietHours.endHour).toBe(23);
    });

    it("should disable quiet hours", () => {
      const quietHours = {
        enabled: false,
        startHour: 22,
        endHour: 7,
      };

      useSettingsStore.getState().setQuietHours(quietHours);

      const state = useSettingsStore.getState();
      expect(state.quietHours.enabled).toBe(false);
    });
  });

  describe("theme transitions", () => {
    it("should allow switching from light to dark", () => {
      useSettingsStore.getState().setTheme("light");
      expect(useSettingsStore.getState().theme).toBe("light");

      useSettingsStore.getState().setTheme("dark");
      expect(useSettingsStore.getState().theme).toBe("dark");
    });

    it("should allow switching from dark to system", () => {
      useSettingsStore.getState().setTheme("dark");
      expect(useSettingsStore.getState().theme).toBe("dark");

      useSettingsStore.getState().setTheme("system");
      expect(useSettingsStore.getState().theme).toBe("system");
    });

    it("should allow switching from system to light", () => {
      useSettingsStore.getState().setTheme("system");
      expect(useSettingsStore.getState().theme).toBe("system");

      useSettingsStore.getState().setTheme("light");
      expect(useSettingsStore.getState().theme).toBe("light");
    });
  });

  describe("refreshInterval edge cases", () => {
    it("should handle zero by setting to minimum", () => {
      useSettingsStore.getState().setRefreshInterval(0);

      const state = useSettingsStore.getState();
      expect(state.refreshInterval).toBe(15);
    });

    it("should handle negative values by setting to minimum", () => {
      useSettingsStore.getState().setRefreshInterval(-10);

      const state = useSettingsStore.getState();
      expect(state.refreshInterval).toBe(15);
    });

    it("should handle very large values", () => {
      useSettingsStore.getState().setRefreshInterval(999999);

      const state = useSettingsStore.getState();
      expect(state.refreshInterval).toBe(999999);
    });
  });

  describe("quietHours edge cases", () => {
    it("should handle same start and end hour", () => {
      const quietHours = {
        enabled: true,
        startHour: 12,
        endHour: 12,
      };

      useSettingsStore.getState().setQuietHours(quietHours);

      const state = useSettingsStore.getState();
      expect(state.quietHours.startHour).toBe(12);
      expect(state.quietHours.endHour).toBe(12);
    });

    it("should handle overnight range (22 to 6)", () => {
      const quietHours = {
        enabled: true,
        startHour: 22,
        endHour: 6,
      };

      useSettingsStore.getState().setQuietHours(quietHours);

      const state = useSettingsStore.getState();
      expect(state.quietHours.startHour).toBe(22);
      expect(state.quietHours.endHour).toBe(6);
    });
  });

  describe("multiple settings changes", () => {
    it("should allow changing multiple settings in sequence", () => {
      useSettingsStore.getState().setTheme("dark");
      useSettingsStore.getState().setShowUnassignedTrips(true);
      useSettingsStore.getState().setRefreshInterval(60);
      useSettingsStore.getState().setAlertSeverityFilter("all");

      const state = useSettingsStore.getState();
      expect(state.theme).toBe("dark");
      expect(state.showUnassignedTrips).toBe(true);
      expect(state.refreshInterval).toBe(60);
      expect(state.alertSeverityFilter).toBe("all");
    });
  });
});
