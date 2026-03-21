/**
 * useOnlineStatus - Hook for monitoring browser online/offline state.
 *
 * Wraps navigator.onLine and listens to online/offline events.
 * Returns true when the browser believes it has network connectivity.
 *
 * Usage:
 *   const isOnline = useOnlineStatus();
 *   if (!isOnline) {
 *     // Show offline banner, serve cached data
 *   }
 */

import { useEffect, useState } from "react";

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}

export default useOnlineStatus;
