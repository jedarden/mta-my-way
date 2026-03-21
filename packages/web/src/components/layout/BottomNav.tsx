import { NavLink } from "react-router-dom";

const navItems = [
  { path: "/", label: "Home", icon: "🏠" },
  { path: "/search", label: "Search", icon: "🔍" },
  { path: "/commute", label: "Commute", icon: "🚇" },
  { path: "/alerts", label: "Alerts", icon: "⚠️" },
] as const;

export default function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-background dark:bg-dark-background border-t border-surface dark:border-dark-surface pb-[env(safe-area-inset-bottom)]"
      role="navigation"
      aria-label="Main navigation"
    >
      <ul className="flex justify-around items-center h-14">
        {navItems.map((item) => (
          <li key={item.path}>
            <NavLink
              to={item.path}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center min-h-touch min-w-touch px-4 rounded-lg transition-colors ${
                  isActive
                    ? "text-mta-primary dark:text-blue-400"
                    : "text-text-secondary dark:text-dark-text-secondary hover:bg-surface dark:hover:bg-dark-surface"
                }`
              }
            >
              <span className="text-xl" role="img" aria-hidden="true">
                {item.icon}
              </span>
              <span className="text-11 font-medium">{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
