import { useLocation, useNavigate } from "react-router-dom";
import { useContextAware } from "../../hooks/useContextAware";
import { NetworkStatusIndicator } from "../common";
import { ContextIndicator } from "../context/ContextIndicator";

const screenTitles: Record<string, string> = {
  "/": "MTA My Way",
  "/search": "Search",
  "/commute": "Commute",
  "/alerts": "Alerts",
  "/settings": "Settings",
  "/reset-password": "Reset Password",
  "/reset-password/confirm": "Reset Password",
};

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const title = screenTitles[location.pathname] ?? "MTA My Way";
  const { context, confidence, enabled, showIndicator } = useContextAware();

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
          {/* Show the detected context while detection is running — a disabled
              store never updates, so its last context would go stale. */}
          <ContextIndicator
            context={context}
            confidence={confidence}
            show={enabled && showIndicator}
            compact
          />
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
