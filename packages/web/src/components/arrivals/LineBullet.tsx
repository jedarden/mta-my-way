/**
 * LineBullet - Circular subway line indicator with official MTA colors
 *
 * 32px visible circle with 44px tap target (via padding).
 * Uses official MTA colors from LINE_METADATA.
 */

import { getLineColor, getLineTextColor } from "@mta-my-way/shared";

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

const sizeClasses = {
  sm: "w-6 h-6 text-11 min-w-touch min-h-touch", // 24px visible, touch target via min
  md: "w-8 h-8 text-base min-w-touch min-h-touch", // 32px visible
  lg: "w-10 h-10 text-lg min-w-touch min-h-touch", // 40px visible
};

export function LineBullet({
  line,
  onClick,
  className = "",
  size = "md",
}: LineBulletProps) {
  const bgColor = getLineColor(line);
  const textColor = getLineTextColor(line);

  return (
    <button
      type="button"
      onClick={onClick}
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
  );
}

export default LineBullet;
