/**
 * Configuration for moments gating behavior.
 * These values can be adjusted for A/B testing.
 */
export const GATING_CONFIG = {
  /**
   * Position of first interstitial in mobile feed (0-indexed).
   * Shows "You found some gems!" message.
   */
  MOBILE_FIRST_GATE_POSITION: 8,

  /**
   * Position of second (gentler) interstitial in mobile feed.
   * Shows "There's a whole world in here" message.
   */
  MOBILE_SECOND_GATE_POSITION: 20,

  /**
   * Number of moments to show after user dismisses gate.
   * (Not currently enforced - user can keep swiping)
   */
  MOMENTS_AFTER_DISMISS: 4,

  /**
   * Desktop: show floating pill after scrolling past N event groups.
   */
  DESKTOP_PILL_AFTER_GROUPS: 2,

  /**
   * Whether to show gates at all (master switch for A/B testing).
   */
  ENABLED: true,
} as const;
