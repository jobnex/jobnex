/**
 * Smoothly scrolls the window to a specific Y coordinate using a quartic ease-out curve.
 * This provides a highly polished, gradual deceleration compared to native behavior.
 * 
 * @param targetY The absolute Y coordinate to scroll to
 * @param duration The duration of the scroll animation in milliseconds
 */
export const smoothScrollTo = (targetY: number, duration: number = 700) => {
  if (typeof window === "undefined") return;

  const startY = window.scrollY;
  const distance = targetY - startY;
  let startTime: number | null = null;

  // Quartic ease out for a very polished, gradual stop
  const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

  const step = (currentTime: number) => {
    if (startTime === null) startTime = currentTime;
    const timeElapsed = currentTime - startTime;
    const progress = Math.min(timeElapsed / duration, 1);
    
    window.scrollTo(0, startY + distance * easeOutQuart(progress));

    if (timeElapsed < duration) {
      window.requestAnimationFrame(step);
    }
  };

  window.requestAnimationFrame(step);
};
