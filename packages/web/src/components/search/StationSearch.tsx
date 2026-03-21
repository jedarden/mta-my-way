/**
 * StationSearch — search input with 200ms debounced type-ahead.
 *
 * Keeps its own internal input state so the UI updates instantly while the
 * debounced `onChange` fires at most once per 200 ms idle period.
 */

import { useEffect, useRef, useState } from "react";

interface StationSearchProps {
  value: string;
  onChange: (value: string) => void;
  /** Debounce delay in ms (default 200) */
  debounceMs?: number;
  autoFocus?: boolean;
}

export function StationSearch({
  value,
  onChange,
  debounceMs = 200,
  autoFocus = false,
}: StationSearchProps) {
  // Local state tracks the raw keystroke value; `value` is the debounced version
  const [inputValue, setInputValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync when the parent clears the value (e.g., "clear" button elsewhere)
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setInputValue(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(next), debounceMs);
  }

  function handleClear() {
    setInputValue("");
    if (timerRef.current) clearTimeout(timerRef.current);
    onChange("");
  }

  return (
    <div className="relative">
      {/* Search icon */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary dark:text-dark-text-secondary pointer-events-none">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      </div>

      <input
        type="search"
        value={inputValue}
        onChange={handleChange}
        placeholder="Search stations, lines, neighborhoods..."
        className="w-full pl-9 pr-10 py-3 bg-surface dark:bg-dark-surface rounded-lg text-text-primary dark:text-dark-text-primary placeholder:text-text-secondary dark:placeholder:text-dark-text-secondary min-h-touch focus:outline-none focus:ring-2 focus:ring-mta-primary"
        aria-label="Search stations"
        // biome-ignore lint/a11y/noAutofocus: intentional — SearchScreen is the user's primary action
        autoFocus={autoFocus}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
      />

      {/* Clear button */}
      {inputValue && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 min-h-touch min-w-touch flex items-center justify-center text-text-secondary hover:text-text-primary dark:hover:text-dark-text-primary"
          aria-label="Clear search"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
