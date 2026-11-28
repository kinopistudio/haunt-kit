/** True when the player asked the system for less motion. Read each time, so a change takes effect at once. */
export function reducedMotion(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}
