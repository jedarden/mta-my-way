/**
 * LazyImage - Image component with lazy loading using Intersection Observer.
 *
 * Features:
 * - Uses Intersection Observer API for performant lazy loading
 * - Falls back to native loading="lazy" for modern browsers
 * - Supports all standard img attributes
 * - Accessible with proper ARIA labels
 * - Shows skeleton placeholder while loading
 */

import { useEffect, useRef, useState } from "react";

interface LazyImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "loading"> {
  /** Image source URL */
  src: string;
  /** Alt text for accessibility */
  alt: string;
  /** Optional placeholder to show while loading */
  placeholder?: React.ReactNode;
  /** Optional class name for the container */
  containerClassName?: string;
  /** Root margin for Intersection Observer (default: "50px") */
  rootMargin?: string;
}

export function LazyImage({
  src,
  alt,
  placeholder,
  containerClassName = "",
  rootMargin = "50px",
  className = "",
  ...imgProps
}: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // Check if browser supports Intersection Observer
    if (!("IntersectionObserver" in window)) {
      // Fallback: load immediately
      setIsInView(true);
      return;
    }

    // Check if image is already in view on mount
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin }
    );

    const currentImg = imgRef.current;
    if (currentImg) {
      observer.observe(currentImg);
    }

    return () => {
      if (currentImg) {
        observer.unobserve(currentImg);
      }
    };
  }, [rootMargin]);

  const handleLoad = () => {
    setIsLoaded(true);
  };

  return (
    <div className={`relative overflow-hidden ${containerClassName}`}>
      {!isLoaded && placeholder && (
        <div className="absolute inset-0 flex items-center justify-center">{placeholder}</div>
      )}
      <img
        ref={imgRef}
        src={isInView ? src : undefined}
        alt={alt}
        loading="lazy"
        onLoad={handleLoad}
        className={`transition-opacity duration-300 ${
          isLoaded ? "opacity-100" : "opacity-0"
        } ${className}`}
        {...imgProps}
      />
    </div>
  );
}

export default LazyImage;
