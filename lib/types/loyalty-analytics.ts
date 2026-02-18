// Loyalty Analytics TypeScript Types
// Type definitions for loyalty program analytics and dashboard components

// ============================================
// Core Loyalty Types
// ============================================

export type LoyaltyTier = 'explorer' | 'local' | 'insider' | 'legend';

export type LoyaltyActivityType =
  | 'event_rsvp'
  | 'event_attendance'
  | 'event_checkin'
  | 'moment_upload'
  | 'moment_like'
  | 'comment_post'
  | 'profile_complete'
  | 'referral'
  | 'invite_accepted'
  | 'first_event'
  | 'streak_bonus'
  | 'reward_redemption'
  | 'admin_adjustment'
  | 'tier_bonus'
  | 'birthday_bonus';

export type RewardCategory = 'experiential' | 'transactional' | 'digital' | 'social' | 'exclusive';

export type RedemptionStatus = 'pending' | 'approved' | 'fulfilled' | 'cancelled' | 'expired';

export type ExperimentStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';

export type AlertSeverity = 'info' | 'warning' | 'error';

export type AlertType =
  | 'point_inflation'
  | 'gaming_detected'
  | 'tier_stagnation'
  | 'redemption_collapse'
  | 'churn_spike';

// ============================================
// Database Table Interfaces
// ============================================

export interface UserLoyaltyStatus {
  user_id: string;
  current_tier: LoyaltyTier;
  total_points_earned: number;
  total_points_spent: number;
  current_point_balance: number;
  last_points_earned_at: string | null;
  last_tier_change_at: string | null;
  enrolled_at: string;
  updated_at: string;
}

export interface LoyaltyPointTransaction {
  id: string;
  user_id: string;
  points_delta: number;
  activity_type: LoyaltyActivityType;
  reference_id: string | null;
  reference_type: 'event' | 'moment' | 'comment' | 'user' | 'reward' | null;
  admin_note: string | null;
  admin_user_id: string | null;
  created_at: string;
}

export interface LoyaltyTierHistory {
  id: string;
  user_id: string;
  old_tier: LoyaltyTier | null;
  new_tier: LoyaltyTier;
  points_at_change: number;
  trigger_type: 'points_threshold' | 'admin_override' | 'tier_decay' | 'points_adjustment';
  achieved_at: string;
}

export interface Reward {
  id: string;
  name: string;
  description: string | null;
  category: RewardCategory;
  points_cost: number;
  min_tier: LoyaltyTier | null;
  is_active: boolean;
  stock_quantity: number | null;
  max_per_user: number | null;
  valid_from: string | null;
  valid_until: string | null;
  partner_name: string | null;
  partner_logo_url: string | null;
  redemption_instructions: string | null;
  monetary_value_usd: number | null;
  cost_to_provide_usd: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RewardRedemption {
  id: string;
  user_id: string;
  reward_id: string;
  points_spent: number;
  user_tier_at_redemption: LoyaltyTier;
  status: RedemptionStatus;
  fulfillment_notes: string | null;
  fulfilled_at: string | null;
  fulfilled_by: string | null;
  redemption_code: string | null;
  redeemed_at: string;
  updated_at: string;
}

export interface LoyaltyExperiment {
  id: string;
  name: string;
  description: string | null;
  hypothesis: string | null;
  variant_config: {
    control: Record<string, unknown>;
    treatment: Record<string, unknown>;
  };
  affected_activity_type: LoyaltyActivityType | null;
  target_user_segment: string | null;
  start_date: string;
  end_date: string | null;
  status: ExperimentStatus;
  results_summary: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoyaltyExperimentAssignment {
  user_id: string;
  experiment_id: string;
  variant: 'control' | 'treatment';
  assigned_at: string;
}

// ============================================
// Analytics API Response Types
// ============================================

export interface TierDistribution {
  tier: LoyaltyTier;
  count: number;
  percentage: number;
}

export interface LoyaltyOverviewStats {
  enrolled_users: number;
  total_users: number;
  enrollment_rate: number;
  active_loyalty_users_7d: number;
  ppau_7d: number;
  redemption_rate_30d: number;
  tier_distribution: TierDistribution[];
}

export interface PPAUDataPoint {
  week: string; // ISO date
  total_points: number;
  active_users: number;
  ppau: number;
  rolling_avg_ppau: number;
}

export interface PointsByActivity {
  activity_type: LoyaltyActivityType;
  transaction_count: number;
  total_points: number;
  avg_points_per_action: number;
  percentage_of_total: number;
}

export interface TierProgressionStats {
  tier: LoyaltyTier;
  users_reached: number;
  median_days_from_signup: number;
  p25_days: number;
  p75_days: number;
}

export interface EngagementImpact {
  metric_name: string;
  pre_loyalty_avg: number;
  post_loyalty_avg: number;
  lift_percentage: number;
}

export interface FlaggedUser {
  user_id: string;
  username: string;
  total_points: number;
  transaction_count: number;
  max_hourly_actions: number;
  activity_types: LoyaltyActivityType[];
  flags: ('HIGH_VELOCITY' | 'LOW_DIVERSITY' | 'OUTLIER_POINTS')[];
}

export interface RewardRedemptionStats {
  reward_id: string;
  reward_name: string;
  points_cost: number;
  redemption_count: number;
  unique_redeemers: number;
  total_value_usd: number;
}

export interface LoyaltyAlert {
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  action?: string;
  action_url?: string;
}

export interface LoyaltyAlertsResponse {
  alerts: LoyaltyAlert[];
  checked_at: string;
}

// ============================================
// User-Facing Types
// ============================================

export interface MyLoyaltySummary {
  current_tier: LoyaltyTier;
  current_points: number;
  total_earned: number;
  total_spent: number;
  enrolled_at: string;
  last_activity: string | null;
  next_tier: LoyaltyTier | null;
  points_to_next_tier: number | null;
  recent_transactions: Array<{
    points: number;
    activity: LoyaltyActivityType;
    created_at: string;
  }>;
}

export interface RedeemRewardResponse {
  success: boolean;
  redemption_id: string;
  points_spent: number;
  new_balance: number;
}

// ============================================
// Chart Data Types
// ============================================

export interface TierFunnelData {
  tier: LoyaltyTier;
  user_count: number;
  conversion_rate: number | null; // null for first tier
}

export interface PointsDistributionBucket {
  min_points: number;
  max_points: number;
  user_count: number;
  percentage: number;
}

export interface CohortRetentionCell {
  signup_month: string;
  months_since_signup: number;
  retention_rate: number;
  user_count: number;
}

export interface EngagementComparisonData {
  metric: 'moments' | 'events' | 'comments';
  loyal_users_avg: number;
  non_loyal_users_avg: number;
  lift_percentage: number;
}

// ============================================
// Economics Types
// ============================================

export interface LoyaltyEconomics {
  total_cost_usd: number;
  engaged_users: number;
  cost_per_engaged_user: number;
  cost_per_rsvp: number;
  cost_per_moment: number;
  cost_per_comment: number;
}

export interface LTVImpact {
  cohort: 'enrolled' | 'not_enrolled';
  avg_ltv: number;
  median_ltv: number;
  user_count: number;
}

// ============================================
// Dashboard Component Props
// ============================================

export interface LoyaltyOverviewCardsProps {
  stats: LoyaltyOverviewStats;
}

export interface PPAUTrendChartProps {
  data: PPAUDataPoint[];
  showAnomalies?: boolean;
}

export interface TierFunnelChartProps {
  data: TierFunnelData[];
}

export interface PointsDistributionChartProps {
  data: PointsDistributionBucket[];
  tierThresholds: Record<LoyaltyTier, number>;
  giniCoefficient: number;
}

export interface EngagementImpactChartProps {
  data: EngagementImpact[];
  loyaltyLaunchDate: string;
}

export interface AlertBannerProps {
  alerts: LoyaltyAlert[];
  onDismiss?: (alert: LoyaltyAlert) => void;
}

export interface FlaggedUsersTableProps {
  users: FlaggedUser[];
  onInvestigate?: (userId: string) => void;
}

export interface RewardStatsTableProps {
  rewards: RewardRedemptionStats[];
  sortBy?: 'redemption_count' | 'total_value_usd';
}

// ============================================
// Admin Action Types
// ============================================

export interface AwardPointsInput {
  user_id: string;
  activity_type: LoyaltyActivityType;
  points?: number;
  reference_id?: string;
  reference_type?: 'event' | 'moment' | 'comment' | 'user' | 'reward';
}

export interface AdjustUserPointsInput {
  user_id: string;
  points_delta: number;
  admin_note: string;
}

export interface OverrideTierInput {
  user_id: string;
  new_tier: LoyaltyTier;
  reason: string;
}

export interface CreateRewardInput {
  name: string;
  description?: string;
  category: RewardCategory;
  points_cost: number;
  min_tier?: LoyaltyTier;
  stock_quantity?: number;
  max_per_user?: number;
  valid_from?: string;
  valid_until?: string;
  partner_name?: string;
  partner_logo_url?: string;
  redemption_instructions?: string;
  monetary_value_usd?: number;
  cost_to_provide_usd?: number;
}

export interface UpdateRedemptionStatusInput {
  redemption_id: string;
  status: RedemptionStatus;
  fulfillment_notes?: string;
}

export interface CreateExperimentInput {
  name: string;
  description?: string;
  hypothesis?: string;
  variant_config: {
    control: Record<string, unknown>;
    treatment: Record<string, unknown>;
  };
  affected_activity_type?: LoyaltyActivityType;
  target_user_segment?: string;
  start_date: string;
  end_date?: string;
}

// ============================================
// Utility Types
// ============================================

export interface TierConfig {
  tier: LoyaltyTier;
  label: string;
  min_points: number;
  color: string;
  icon: string;
  perks: string[];
}

export const TIER_CONFIGS: Record<LoyaltyTier, TierConfig> = {
  explorer: {
    tier: 'explorer',
    label: 'Explorer',
    min_points: 0,
    color: '#94a3b8', // slate-400
    icon: '🔍',
    perks: ['Earn points on every action', 'Access to basic rewards'],
  },
  local: {
    tier: 'local',
    label: 'Local',
    min_points: 100,
    color: '#3b82f6', // blue-500
    icon: '🏠',
    perks: ['Priority RSVP notifications', 'Exclusive Local badge', '10% bonus points'],
  },
  insider: {
    tier: 'insider',
    label: 'Insider',
    min_points: 500,
    color: '#a855f7', // purple-500
    icon: '⭐',
    perks: ['Early event access', 'VIP lounge invites', '20% bonus points', 'Insider-only rewards'],
  },
  legend: {
    tier: 'legend',
    label: 'Legend',
    min_points: 2000,
    color: '#f59e0b', // amber-500
    icon: '👑',
    perks: ['All perks', 'Private event invites', '50% bonus points', 'Lifetime Legend status'],
  },
};

export const ACTIVITY_POINT_VALUES: Record<LoyaltyActivityType, number> = {
  event_rsvp: 10,
  event_attendance: 50,
  event_checkin: 25,
  moment_upload: 25,
  moment_like: 2,
  comment_post: 5,
  profile_complete: 20,
  referral: 100,
  invite_accepted: 50,
  first_event: 30,
  streak_bonus: 15,
  tier_bonus: 50,
  birthday_bonus: 25,
  reward_redemption: 0, // special case - negative delta
  admin_adjustment: 0, // special case - variable
};

export const ACTIVITY_LABELS: Record<LoyaltyActivityType, string> = {
  event_rsvp: 'RSVP to Event',
  event_attendance: 'Attended Event',
  event_checkin: 'Checked In',
  moment_upload: 'Shared Moment',
  moment_like: 'Liked Moment',
  comment_post: 'Posted Comment',
  profile_complete: 'Completed Profile',
  referral: 'Referred Friend',
  invite_accepted: 'Invite Accepted',
  first_event: 'First Event',
  streak_bonus: 'Streak Bonus',
  tier_bonus: 'Tier Bonus',
  birthday_bonus: 'Birthday Bonus',
  reward_redemption: 'Redeemed Reward',
  admin_adjustment: 'Admin Adjustment',
};

// ============================================
// Helper Functions
// ============================================

export function getTierRank(tier: LoyaltyTier): number {
  const ranks: Record<LoyaltyTier, number> = {
    explorer: 1,
    local: 2,
    insider: 3,
    legend: 4,
  };
  return ranks[tier];
}

export function getNextTier(currentTier: LoyaltyTier): LoyaltyTier | null {
  const tiers: LoyaltyTier[] = ['explorer', 'local', 'insider', 'legend'];
  const currentIndex = tiers.indexOf(currentTier);
  return currentIndex < tiers.length - 1 ? tiers[currentIndex + 1] : null;
}

export function getPointsToNextTier(currentPoints: number, currentTier: LoyaltyTier): number | null {
  const nextTier = getNextTier(currentTier);
  if (!nextTier) return null;
  const nextTierConfig = TIER_CONFIGS[nextTier];
  return Math.max(0, nextTierConfig.min_points - currentPoints);
}

export function getTierFromPoints(points: number): LoyaltyTier {
  if (points >= TIER_CONFIGS.legend.min_points) return 'legend';
  if (points >= TIER_CONFIGS.insider.min_points) return 'insider';
  if (points >= TIER_CONFIGS.local.min_points) return 'local';
  return 'explorer';
}

export function formatPoints(points: number): string {
  return points.toLocaleString();
}

export function calculateGiniCoefficient(pointBalances: number[]): number {
  // Gini coefficient: measure of inequality (0 = perfect equality, 1 = perfect inequality)
  if (pointBalances.length === 0) return 0;

  const sorted = [...pointBalances].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((acc, val) => acc + val, 0);

  if (sum === 0) return 0;

  let numerator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i + 1) * sorted[i];
  }

  const gini = (2 * numerator) / (n * sum) - (n + 1) / n;
  return Math.max(0, Math.min(1, gini)); // clamp to [0, 1]
}

export function isHealthyGini(gini: number): boolean {
  return gini >= 0.3 && gini <= 0.5;
}

export function getAlertColor(severity: AlertSeverity): string {
  const colors: Record<AlertSeverity, string> = {
    info: 'blue',
    warning: 'yellow',
    error: 'red',
  };
  return colors[severity];
}

export function getAlertIcon(severity: AlertSeverity): string {
  const icons: Record<AlertSeverity, string> = {
    info: 'ℹ️',
    warning: '⚠️',
    error: '🚨',
  };
  return icons[severity];
}
