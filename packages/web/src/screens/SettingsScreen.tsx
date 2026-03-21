import { useState } from "react";
import Screen from "../components/layout/Screen";

export default function SettingsScreen() {
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");

  return (
    <Screen>
      <div className="px-4 pt-2 pb-4">
        <section aria-labelledby="appearance-heading" className="mb-6">
          <h2
            id="appearance-heading"
            className="text-lg font-semibold mb-4 text-text-primary dark:text-dark-text-primary"
          >
            Appearance
          </h2>
          <div className="bg-surface dark:bg-dark-surface rounded-lg">
            <div className="p-4 border-b border-background dark:border-dark-background">
              <label className="flex items-center justify-between">
                <span className="text-text-primary dark:text-dark-text-primary">Theme</span>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as typeof theme)}
                  className="bg-background dark:bg-dark-background text-text-primary dark:text-dark-text-primary rounded px-3 py-2 min-h-touch"
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
            </div>
          </div>
        </section>

        <section aria-labelledby="data-heading" className="mb-6">
          <h2
            id="data-heading"
            className="text-lg font-semibold mb-4 text-text-primary dark:text-dark-text-primary"
          >
            Data
          </h2>
          <div className="bg-surface dark:bg-dark-surface rounded-lg">
            <div className="p-4 border-b border-background dark:border-dark-background">
              <label className="flex items-center justify-between">
                <span className="text-text-primary dark:text-dark-text-primary">
                  Show unassigned trips
                </span>
                <input type="checkbox" className="w-5 h-5 accent-mta-primary" />
              </label>
            </div>
            <div className="p-4 border-b border-background dark:border-dark-background">
              <label className="flex items-center justify-between">
                <span className="text-text-primary dark:text-dark-text-primary">
                  Refresh interval
                </span>
                <select className="bg-background dark:bg-dark-background text-text-primary dark:text-dark-text-primary rounded px-3 py-2 min-h-touch">
                  <option value="15">15 seconds</option>
                  <option value="30">30 seconds</option>
                  <option value="60">60 seconds</option>
                </select>
              </label>
            </div>
          </div>
        </section>

        <section aria-labelledby="notifications-heading" className="mb-6">
          <h2
            id="notifications-heading"
            className="text-lg font-semibold mb-4 text-text-primary dark:text-dark-text-primary"
          >
            Notifications
          </h2>
          <div className="bg-surface dark:bg-dark-surface rounded-lg">
            <div className="p-4 border-b border-background dark:border-dark-background">
              <label className="flex items-center justify-between">
                <span className="text-text-primary dark:text-dark-text-primary">
                  Push notifications
                </span>
                <input type="checkbox" className="w-5 h-5 accent-mta-primary" />
              </label>
            </div>
          </div>
        </section>

        <section aria-labelledby="about-heading">
          <h2
            id="about-heading"
            className="text-lg font-semibold mb-4 text-text-primary dark:text-dark-text-primary"
          >
            About
          </h2>
          <div className="bg-surface dark:bg-dark-surface rounded-lg p-4">
            <p className="text-text-secondary dark:text-dark-text-secondary">MTA My Way v0.0.1</p>
            <p className="text-13 text-text-secondary dark:text-dark-text-secondary mt-2">
              A mobile-first PWA for NYC subway commuters
            </p>
          </div>
        </section>
      </div>
    </Screen>
  );
}
