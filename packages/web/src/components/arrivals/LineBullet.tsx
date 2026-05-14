/**
 * LineBullet - Circular subway line indicator with official MTA colors
 *
 * 32px visible circle with 44px tap target (via padding).
 * Uses official MTA colors from LINE_METADATA.
 * Long-press (300ms) shows line info tooltip (name, division, express/local).
 */

import { getLineColor, getLineMetadata, getLineTextColor } from "@mta-my-way/shared";
import { useCallback, useRef, useState } from "react";

interface LineBulletProps {
  /** Line ID, e.g., "1", "A", "F" */
  line: string;
  /** Optional click handler */
  onClick?: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
}

const LONG_PRESS_DURATION = 300;

const sizeClasses = {
  sm: "w-6 h-6 text-11 min-w-touch min-h-touch", // 24px visible, touch target via min
  md: "w-8 h-8 text-base min-w-touch min-h-touch", // 32px visible
  lg: "w-10 h-10 text-lg min-w-touch min-h-touch", // 40px visible
};

export function LineBullet({ line, onClick, className = "", size = "md" }: LineBulletProps) {
  const bgColor = getLineColor(line);
  const textColor = getLineTextColor(line);
  const [showTooltip, setShowTooltip] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const startLongPress = useCallback(() => {
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setShowTooltip(true);
    }, LONG_PRESS_DURATION);
  }, []);

  const endLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setShowTooltip(false);
  }, []);

  const handleClick = useCallback(() => {
    if (!longPressFired.current && onClick) {
      onClick();
    }
    longPressFired.current = false;
  }, [onClick]);

  const meta = getLineMetadata(line);

  return (
    <span
      className="relative inline-flex"
      onPointerDown={startLongPress}
      onPointerUp={endLongPress}
      onPointerLeave={endLongPress}
      onPointerCancel={endLongPress}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        onClick={handleClick}
        disabled={!onClick}
        className={`
          inline-flex items-center justify-center
          rounded-full font-bold
          focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
          disabled:cursor-default
          ${sizeClasses[size]}
          ${className}
        `}
        style={{
          backgroundColor: bgColor,
          color: textColor,
        }}
        aria-label={`${line} train`}
      >
        {line}
      </button>
      {showTooltip && meta && (
        <div
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none"
        >
          <div className="bg-gray-900 text-white text-sm rounded-lg px-3 py-2 shadow-lg whitespace-nowrap">
            <p className="font-semibold">{meta.longName}</p>
            <p className="text-gray-300 text-xs mt-0.5">
              Division {meta.division} · {meta.isExpress ? "Express" : "Local"}
            </p>
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </span>
  );
}

export default LineBullet;
