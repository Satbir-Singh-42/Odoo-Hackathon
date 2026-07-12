import { RefObject, useCallback, useEffect, useLayoutEffect, useState } from "react";

interface UseSmartDropdownPositionParams {
  isOpen: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  menuRef: RefObject<HTMLElement | null>;
  preferredMaxHeight?: number;
  offset?: number;
}

const MIN_DROPDOWN_HEIGHT = 64;

const getViewportBounds = () => {
  if (typeof window === "undefined") {
    return { top: 0, bottom: 0 };
  }

  const viewport = window.visualViewport;
  if (viewport) {
    return {
      top: viewport.offsetTop,
      bottom: viewport.offsetTop + viewport.height,
    };
  }

  return { top: 0, bottom: window.innerHeight };
};

export function useSmartDropdownPosition({
  isOpen,
  anchorRef,
  menuRef,
  preferredMaxHeight = 240,
  offset = 8,
}: UseSmartDropdownPositionParams) {
  const [openUpward, setOpenUpward] = useState(false);
  const [maxHeight, setMaxHeight] = useState(preferredMaxHeight);

  const recalculate = useCallback(() => {
    if (!isOpen || typeof window === "undefined") return;

    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const { top: viewportTop, bottom: viewportBottom } = getViewportBounds();

    const spaceAbove = Math.max(0, rect.top - viewportTop - offset);
    const spaceBelow = Math.max(0, viewportBottom - rect.bottom - offset);

    const menuHeight = Math.min(
      preferredMaxHeight,
      menuRef.current?.scrollHeight || preferredMaxHeight,
    );

    const shouldOpenUpward =
      spaceBelow < menuHeight &&
      (spaceAbove > spaceBelow || spaceBelow < MIN_DROPDOWN_HEIGHT);

    const availableSpace = shouldOpenUpward ? spaceAbove : spaceBelow;
    const clampedHeight = Math.min(
      preferredMaxHeight,
      Math.max(MIN_DROPDOWN_HEIGHT, Math.floor(availableSpace)),
    );

    setOpenUpward(shouldOpenUpward);
    setMaxHeight(clampedHeight);
  }, [anchorRef, isOpen, menuRef, offset, preferredMaxHeight]);

  useLayoutEffect(() => {
    if (!isOpen) return;

    recalculate();

    // Recalculate after layout/keyboard settles (especially on iOS).
    const raf1 = requestAnimationFrame(() => recalculate());
    const raf2 = requestAnimationFrame(() => {
      requestAnimationFrame(() => recalculate());
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [isOpen, recalculate]);

  useEffect(() => {
    if (!isOpen) return;

    const handleViewportChange = () => recalculate();

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", handleViewportChange);
    viewport?.addEventListener("scroll", handleViewportChange);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      viewport?.removeEventListener("resize", handleViewportChange);
      viewport?.removeEventListener("scroll", handleViewportChange);
    };
  }, [isOpen, recalculate]);

  return {
    openUpward,
    maxHeight,
  };
}
