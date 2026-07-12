import { useState, useEffect, useRef, useCallback } from "react";

const MOBILE_BREAKPOINT = 768;
const THROTTLE_MS = 150;

/**
 * Custom hook to detect mobile viewport.
 * Returns true when window width is below the mobile breakpoint (768px).
 * Throttled to avoid excessive re-renders during resize.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => window.innerWidth < MOBILE_BREAKPOINT,
  );
  const lastCallRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkMobile = useCallback(() => {
    const now = Date.now();
    const elapsed = now - lastCallRef.current;

    if (elapsed >= THROTTLE_MS) {
      lastCallRef.current = now;
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    } else if (!timerRef.current) {
      timerRef.current = setTimeout(() => {
        lastCallRef.current = Date.now();
        setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
        timerRef.current = null;
      }, THROTTLE_MS - elapsed);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("resize", checkMobile);
    return () => {
      window.removeEventListener("resize", checkMobile);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [checkMobile]);

  return isMobile;
}
