import { usePreferencesSyncStore } from "../../stores/syncStore";

/** A non-blocking notice for queued preference-sync failures. */
export function SyncErrorToast() {
  const error = usePreferencesSyncStore((state) => state.error);
  const clearError = usePreferencesSyncStore((state) => state.clearError);

  if (!error) return null;

  return (
    <div
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-lg bg-red-700 px-4 py-3 text-white shadow-lg"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-3">
        <p className="flex-1 text-13 leading-5">{error}</p>
        <button
          type="button"
          onClick={clearError}
          className="min-h-touch px-1 text-13 font-medium underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          aria-label="Dismiss sync error"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
