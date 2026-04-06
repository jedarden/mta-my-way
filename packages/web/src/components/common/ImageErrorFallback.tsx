/**
 * ImageErrorFallback - Fallback UI for failed image loads.
 *
 * Per plan.md Phase 4: Comprehensive error states with clear recovery options.
 *
 * Features:
 *   - Shows placeholder when image fails to load
 *   - Supports multiple fallback modes (icon, text, custom)
 *   - Accessible with proper ARIA labels
 *   - Retry capability for transient failures
 *   - Maintains layout dimensions to prevent CLS
 */

import { useState } from "react";

type FallbackMode = "icon" | "text" | "custom";

interface ImageErrorFallbackProps {
  /** Original alt text for accessibility */
  alt: string;
  /** Width of the image/container (for layout stability) */
  width?: string | number;
  /** Height of the image/container (for layout stability) */
  height?: string | number;
  /** Display mode for the fallback */
  mode?: FallbackMode;
  /** Custom fallback element when mode is "custom" */
  customFallback?: React.ReactNode;
  /** Optional icon override */
  icon?: React.ReactNode;
  /** Optional text override */
  text?: string;
  /** Whether to show a retry button */
  canRetry?: boolean;
  /** Called when user taps retry */
  onRetry?: () => void;
  /** Optional container class name */
  className?: string;
  /** Whether this is for a map image (context-specific styling) */
  isMap?: boolean;
  /** Whether this is for a station/map thumbnail */
  isThumbnail?: boolean;
}

/**
 * Get default icon for image error fallback
 */
function getDefaultIcon(isMap: boolean): React.ReactNode {
  if (isMap) {
    return (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
        <line x1="8" y1="2" x2="8" y2="18" />
        <line x1="16" y1="6" x2="16" y2="22" />
      </svg>
    );
  }

  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

/**
 * Get default text for image error fallback
 */
function getDefaultText(isMap: boolean, alt: string): string {
  if (isMap) {
    return "Map unavailable";
  }
  if (alt) {
    return `Image unavailable: ${alt}`;
  }
  return "Image unavailable";
}

/**
 * ImageErrorFallback - Shows when an image fails to load
 */
export function ImageErrorFallback({
  alt,
  width = "100%",
  height = "auto",
  mode = "icon",
  customFallback,
  icon,
  text,
  canRetry = false,
  onRetry,
  className = "",
  isMap = false,
  isThumbnail = false,
}: ImageErrorFallbackProps) {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = () => {
    if (isRetrying || !onRetry) return;
    setIsRetrying(true);
    onRetry();
    // Reset retry state after a short delay
    setTimeout(() => setIsRetrying(false), 2000);
  };

  const defaultIcon = getDefaultIcon(isMap);
  const defaultText = getDefaultText(isMap, alt);

  // Base styling
  const baseClass =
    "flex flex-col items-center justify-center bg-surface dark:bg-dark-surface rounded-lg overflow-hidden";
  const sizeClass = isThumbnail
    ? "w-16 h-16"
    : typeof width === "number" && typeof height === "number"
      ? ""
      : "w-full h-full";
  const combinedClass = `${baseClass} ${sizeClass} ${className}`.trim();

  const style = {
    width: typeof width === "number" ? `${width}px` : width,
    height: typeof height === "number" ? `${height}px` : height,
    minHeight: isThumbnail ? "64px" : "200px",
  };

  return (
    <div className={combinedClass} style={style} role="img" aria-label={text || defaultText}>
      {/* Custom fallback */}
      {mode === "custom" && customFallback && <>{customFallback}</>}

      {/* Icon mode */}
      {mode === "icon" && (
        <div className="flex flex-col items-center gap-3 p-4 text-center">
          <span className="text-text-secondary dark:text-dark-text-secondary">
            {icon || defaultIcon}
          </span>
          {!isThumbnail && (
            <>
              <p className="text-13 text-text-secondary dark:text-dark-text-secondary max-w-xs">
                {text || defaultText}
              </p>
              {canRetry && onRetry && (
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={isRetrying}
                  className="text-13 text-mta-primary font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 min-h-touch"
                  aria-label={`Retry loading ${alt}`}
                >
                  {isRetrying ? (
                    <>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="animate-spin"
                        aria-hidden="true"
                      >
                        <polyline points="23 4 23 10 17 10" />
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                      </svg>
                      Retrying...
                    </>
                  ) : (
                    <>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <polyline points="23 4 23 10 17 10" />
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                      </svg>
                      Retry
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Text mode */}
      {mode === "text" && (
        <div className="p-4 text-center">
          <p className="text-13 text-text-secondary dark:text-dark-text-secondary">
            {text || defaultText}
          </p>
          {canRetry && onRetry && !isThumbnail && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={isRetrying}
              className="mt-2 text-13 text-mta-primary font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRetrying ? "Retrying..." : "Retry"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * SafeImage - Wrapper component that handles image loading errors
 */
interface SafeImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "onError"> {
  /** Fallback mode */
  fallbackMode?: FallbackMode;
  /** Custom fallback element */
  customFallback?: React.ReactNode;
  /** Whether to show retry button on error */
  canRetry?: boolean;
  /** Whether this is a map image */
  isMap?: boolean;
  /** Whether this is a thumbnail */
  isThumbnail?: boolean;
}

export function SafeImage({
  fallbackMode = "icon",
  customFallback,
  canRetry = true,
  isMap = false,
  isThumbnail = false,
  className = "",
  alt = "",
  src,
  ...imgProps
}: SafeImageProps) {
  const [hasError, setHasError] = useState(false);

  const handleRetry = () => {
    setHasError(false);
  };

  if (hasError) {
    return (
      <ImageErrorFallback
        alt={alt}
        mode={fallbackMode}
        customFallback={customFallback}
        canRetry={canRetry}
        onRetry={handleRetry}
        isMap={isMap}
        isThumbnail={isThumbnail}
        className={className}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
      {...imgProps}
    />
  );
}

export default ImageErrorFallback;
