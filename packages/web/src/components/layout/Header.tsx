import { useLocation } from "react-router-dom";

const screenTitles: Record<string, string> = {
  "/": "MTA My Way",
  "/search": "Search",
  "/commute": "Commute",
  "/alerts": "Alerts",
  "/settings": "Settings",
};

export default function Header() {
  const location = useLocation();
  const title = screenTitles[location.pathname] ?? "MTA My Way";

  return (
    <header
      className="sticky top-0 z-50 bg-background dark:bg-dark-background border-b border-surface dark:border-dark-surface px-4 py-3 pt-[env(safe-area-inset-top)]"
      role="banner"
    >
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary dark:text-dark-text-primary">{title}</h1>
        <div className="flex items-center gap-2">
          {/* Alert badge - will be populated from store */}
          <button
            className="p-2 rounded-full min-h-touch min-w-touch flex items-center justify-center hover:bg-surface dark:hover:bg-dark-surface"
            aria-label="View alerts"
          >
            <span className="text-2xl">🔔</span>
          </button>
        </div>
      </div>
    </header>
  );
}
