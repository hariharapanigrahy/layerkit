/**
 * Fixture analytics emit sites for domain discovery evals (not production).
 */

export function trackPurchase(userEmail: string, orderId: string): void {
  // Intent name + nested user.email field path for heuristics
  track('purchase', {
    user: { email: userEmail },
    orderId,
  });
}

// Minimal track helper so the call site is self-contained
function track(eventName: string, payload: Record<string, unknown>): void {
  void eventName;
  void payload;
}
