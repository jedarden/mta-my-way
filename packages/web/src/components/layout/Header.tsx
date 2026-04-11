import { useLocation, useNavigate } from "react-router-dom";
import { NetworkStatusIndicator } from "../common";

// Context-aware feature disabled to reduce security surface area
// import { useContextAware } from "../../hooks/useContextAware";
// import { ContextIndicator } from "../context/ContextIndicator";

const screenTitles: Record<string, string> = {
  "/": "MTA My Way",
  "/search": "Search",
  "/commute": "Commute",
  "/alerts": "Alerts",
  "/settings": "Settings",
};

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const title = screenTitles[location.pathname] ?? "MTA My Way";

  return (
    <header
      className="sticky top-0 z-50 bg-background dark:bg-dark-background border-b border-surface dark:border-dark-surface px-4 py-3 pt-[env(safe-area-inset-top)]"
      role="banner"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-text-primary dark:text-dark-text-primary">
            {title}
          </h1>
          {/* Context-aware feature disabled to reduce security surface area */}
          {/* <ContextIndicator
            context={context}
            confidence={confidence}
            show={showIndicator}
            compact
          /> */}
          <NetworkStatusIndicator compact />
        </div>
        <div className="flex items-center gap-2">
          {/* Alert badge */}
          <button
            type="button"
            onClick={() => void navigate("/alerts")}
            className="p-2 rounded-full min-h-touch min-w-touch flex items-center justify-center hover:bg-surface dark:hover:bg-dark-surface"
            aria-label="View alerts"
          >
            <span className="text-2xl" role="img" aria-hidden="true">
              🔔
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
