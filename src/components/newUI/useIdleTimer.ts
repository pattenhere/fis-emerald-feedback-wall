import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_IDLE_MS = 45_000;

export const useIdleTimer = (
  enabled: boolean,
  idleMs: number = DEFAULT_IDLE_MS,
): { isIdle: boolean; resetIdleTimer: () => void } => {
  const [isIdle, setIsIdle] = useState(false);
  const timerRef = useRef<number | null>(null);

  const resetIdleTimer = useCallback(() => {
    if (!enabled || typeof window === "undefined") return;
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
    }
    setIsIdle(false);
    timerRef.current = window.setTimeout(() => {
      setIsIdle(true);
    }, Math.max(1, idleMs));
  }, [enabled, idleMs]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setIsIdle(false);
      return;
    }

    const handleActivity = (): void => {
      resetIdleTimer();
    };

    const events: Array<keyof WindowEventMap> = ["mousemove", "mousedown", "keydown", "touchstart", "touchmove"];
    for (const eventName of events) {
      document.addEventListener(eventName, handleActivity, { passive: true });
    }
    resetIdleTimer();

    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      for (const eventName of events) {
        document.removeEventListener(eventName, handleActivity);
      }
    };
  }, [resetIdleTimer]);

  return { isIdle, resetIdleTimer };
};
