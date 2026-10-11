"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface UseHeaderMorphOptions {
  enabled: boolean;
}

// Nonlinear physics curve: initial 80% of effect executes fast (in first ~30% of time),
// then the remaining 20% slowly decelerates and settles with zero bounce or jerk.
function physicsCurve(t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1);
  return 1 - Math.pow(1 - clamped, 4.2);
}

export function useHeaderMorph({ enabled }: UseHeaderMorphOptions) {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isFocusedOverride, setIsFocusedOverride] = useState(false);
  const [previousEnabled, setPreviousEnabled] = useState(enabled);
  if (previousEnabled !== enabled) {
    setPreviousEnabled(enabled);
    setScrollProgress(0);
    setIsFocusedOverride(false);
  }

  const headerRef = useRef<HTMLElement>(null);
  const shortcutsContainerRef = useRef<HTMLDivElement>(null);
  const shortcutsTrackRef = useRef<HTMLDivElement>(null);

  // Discrete state: strictly 0 (full) or 1 (compact)
  // Eliminates intermediate stopping and boundary indecision
  const targetStateRef = useRef<0 | 1>(0);
  const currentProgressRef = useRef<number>(0);
  const animFrameIdRef = useRef<number | null>(null);
  const isTransitioningRef = useRef(false);
  const isFocusedOverrideRef = useRef(false);
  const startScrollYOnFocusRef = useRef(0);

  // Directly mutate CSS custom properties and DOM transforms for 120fps hardware-accelerated rendering
  const applyProgressStyles = useCallback((progress: number) => {
    currentProgressRef.current = progress;

    if (headerRef.current) {
      headerRef.current.style.setProperty("--scroll-p", progress.toFixed(4));
      headerRef.current.style.setProperty("--scroll-inv-p", (1 - progress).toFixed(4));
    }

    // Mathematical centering calculation for shortcuts track on desktop screens
    if (shortcutsTrackRef.current && shortcutsContainerRef.current) {
      const isDesktop = typeof window !== "undefined" && window.innerWidth >= 768;
      if (isDesktop) {
        const containerW = shortcutsContainerRef.current.clientWidth;
        const trackW = shortcutsTrackRef.current.scrollWidth;
        const maxShift = Math.max(0, (containerW - trackW) / 2);
        const shift = progress * maxShift;
        shortcutsTrackRef.current.style.transform = `translateX(${shift.toFixed(2)}px)`;
      } else {
        shortcutsTrackRef.current.style.transform = "none";
      }
    }
  }, []);

  // Physics animation: 80% fast, 20% slow luxurious settling
  const animateToTarget = useCallback(
    (target: 0 | 1, duration = 280) => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }

      targetStateRef.current = target;
      const startProgress = currentProgressRef.current;

      // If already fully at target, ensure styles are cleanly locked
      if (Math.abs(startProgress - target) < 0.001) {
        applyProgressStyles(target);
        setScrollProgress(target);
        isTransitioningRef.current = false;
        return;
      }

      // Lock transition to prevent interruption by scroll events
      isTransitioningRef.current = true;
      // Pre-set discrete state so that binary UI props (placeholders, pointers) immediately update
      setScrollProgress(target);

      const startTime = performance.now();

      const step = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / duration, 1);

        // Nonlinear physics curve
        const eased = physicsCurve(t);
        const current = startProgress + (target - startProgress) * eased;

        applyProgressStyles(current);

        if (t < 1) {
          animFrameIdRef.current = requestAnimationFrame(step);
        } else {
          // Guarantee clean, definitive snap at boundary (strictly 0 or 1)
          applyProgressStyles(target);
          setScrollProgress(target);
          isTransitioningRef.current = false;
          animFrameIdRef.current = null;
        }
      };

      animFrameIdRef.current = requestAnimationFrame(step);
    },
    [applyProgressStyles]
  );

  // Set focus override to expand/collapse header with smooth physics
  const setFocusedOverride = useCallback(
    (focused: boolean) => {
      isFocusedOverrideRef.current = focused;
      setIsFocusedOverride(focused);
      if (!enabled) return;

      if (focused) {
        startScrollYOnFocusRef.current = typeof window !== "undefined" ? window.scrollY : 0;
        animateToTarget(0, 280);
      } else {
        const scrollY = typeof window !== "undefined" ? window.scrollY : 0;
        const nextTarget: 0 | 1 = scrollY > 40 ? 1 : 0;
        animateToTarget(nextTarget, 280);
      }
    },
    [enabled, animateToTarget]
  );

  // Ratchet hysteresis scroll listener: 100% immune to boundary flickering
  useEffect(() => {
    if (!enabled) {
      applyProgressStyles(0);
      isFocusedOverrideRef.current = false;
      targetStateRef.current = 0;
      isTransitioningRef.current = false;
      return;
    }

    // Wide dead-zone gap:
    // Full (0) -> Compact (1): User scrolls down past 65px
    // Compact (1) -> Full (0): User scrolls all the way back to the top (<= 8px)
    // The 57px dead-zone strictly exceeds any DOM displacement, eliminating feedback loops
    const DOWN_SNAP_THRESHOLD = 65;
    const UP_SNAP_THRESHOLD = 8;

    const handleScroll = () => {
      // Transition lock: while an animation is in flight, completely ignore all scroll events
      if (isTransitioningRef.current) return;

      const currentY = window.scrollY;

      // If user scrolls substantially while focus override is active, release override naturally
      if (isFocusedOverrideRef.current && Math.abs(currentY - startScrollYOnFocusRef.current) > 30) {
        isFocusedOverrideRef.current = false;
        setIsFocusedOverride(false);
      }

      if (isFocusedOverrideRef.current) return;

      // One-way ratchet logic:
      // When FULL (0): Must cross 65px downwards to collapse
      // When COMPACT (1): Remains COMPACT at ALL depths until user reaches <= 8px (top of page)
      if (targetStateRef.current === 0 && currentY >= DOWN_SNAP_THRESHOLD) {
        animateToTarget(1, 280);
      } else if (targetStateRef.current === 1 && currentY <= UP_SNAP_THRESHOLD) {
        animateToTarget(0, 280);
      }
    };

    const handleResize = () => {
      applyProgressStyles(currentProgressRef.current);
    };

    // Initialize on mount without triggering an unexpected animation
    const initialY = typeof window !== "undefined" ? window.scrollY : 0;
    const initialTarget: 0 | 1 = initialY >= DOWN_SNAP_THRESHOLD ? 1 : 0;
    targetStateRef.current = initialTarget;
    applyProgressStyles(initialTarget);
    const initialFrame = requestAnimationFrame(() => setScrollProgress(initialTarget));

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize, { passive: true });

    return () => {
      cancelAnimationFrame(initialFrame);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [enabled, applyProgressStyles, animateToTarget]);

  return {
    scrollProgress: enabled ? scrollProgress : 0,
    isFocusedOverride: enabled && isFocusedOverride,
    setFocusedOverride,
    headerRef,
    shortcutsContainerRef,
    shortcutsTrackRef,
  };
}
