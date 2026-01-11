import { createClient } from "@/lib/supabase/server";
import type {
  TimeSeriesDataPoint,
  RoleDistribution,
  EventActivityData,
  RsvpTrendsData,
  DashboardOverview,
} from "@/lib/types";

// ============================================
// Dashboard Overview (single call)
// ============================================

export async function getDashboardOverview(): Promise<DashboardOverview | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_dashboard_overview");

    if (error) {
      console.error("Error fetching dashboard overview:", error);
      return null;
    }

    return data as DashboardOverview;
  } catch (e) {
    console.error("Exception fetching dashboard overview:", e);
    return null;
  }
}

// ============================================
// User Analytics
// ============================================

export async function getUserGrowth(daysBack = 30): Promise<TimeSeriesDataPoint[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_user_growth", {
      days_back: daysBack,
    });

    if (error) {
      console.error("Error fetching user growth:", error);
      return [];
    }

    return (data ?? []) as TimeSeriesDataPoint[];
  } catch (e) {
    console.error("Exception fetching user growth:", e);
    return [];
  }
}

export async function getRoleDistribution(): Promise<RoleDistribution[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_role_distribution");

    if (error) {
      console.error("Error fetching role distribution:", error);
      return [];
    }

    return (data ?? []) as RoleDistribution[];
  } catch (e) {
    console.error("Exception fetching role distribution:", e);
    return [];
  }
}

// ============================================
// Event Analytics
// ============================================

export async function getEventActivity(daysBack = 30): Promise<EventActivityData[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_event_activity", {
    days_back: daysBack,
  });

  if (error) {
    console.error("Error fetching event activity:", error);
    return [];
  }

  return (data ?? []) as EventActivityData[];
}

// ============================================
// RSVP Analytics
// ============================================

export async function getRsvpTrends(daysBack = 30): Promise<RsvpTrendsData[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_rsvp_trends", {
    days_back: daysBack,
  });

  if (error) {
    console.error("Error fetching RSVP trends:", error);
    return [];
  }

  return (data ?? []) as RsvpTrendsData[];
}

// ============================================
// Verification Queue
// ============================================

export interface VerificationQueueStats {
  pending_count: number;
  approved_count: number;
  rejected_count: number;
  more_info_count: number;
}

export async function getVerificationQueueStats(): Promise<VerificationQueueStats | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_verification_queue_stats");

  if (error) {
    console.error("Error fetching verification queue stats:", error);
    return null;
  }

  // RPC returns array with single row
  return data?.[0] ?? null;
}

// ============================================
// Extraction Analytics
// ============================================

export interface ExtractionStats {
  total_extractions: number;
  total_extracted: number;
  total_published: number;
  total_skipped: number;
  success_rate: number;
  by_status: Array<{ status: string; count: number }>;
}

export async function getExtractionStats(): Promise<ExtractionStats | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_extraction_stats");

  if (error) {
    console.error("Error fetching extraction stats:", error);
    return null;
  }

  return data?.[0] ?? null;
}

// ============================================
// Festival Analytics
// ============================================

export interface FestivalStats {
  total_festivals: number;
  active_festivals: number;
  upcoming_festivals: number;
  total_official_events: number;
}

export async function getFestivalStats(): Promise<FestivalStats | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_festival_stats");

  if (error) {
    console.error("Error fetching festival stats:", error);
    return null;
  }

  return data?.[0] ?? null;
}

// ============================================
// Notification Analytics
// ============================================

export interface NotificationStats {
  users_with_push: number;
  total_users: number;
  adoption_rate: number;
}

export async function getNotificationStats(): Promise<NotificationStats | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_notification_stats");

  if (error) {
    console.error("Error fetching notification stats:", error);
    return null;
  }

  return data?.[0] ?? null;
}

// ============================================
// Combined fetch for dashboard
// ============================================

export interface FullDashboardData {
  overview: DashboardOverview | null;
  userGrowth: TimeSeriesDataPoint[];
  roleDistribution: RoleDistribution[];
  eventActivity: EventActivityData[];
  rsvpTrends: RsvpTrendsData[];
  verificationQueue: VerificationQueueStats | null;
  extractionStats: ExtractionStats | null;
  festivalStats: FestivalStats | null;
}

export async function getFullDashboardData(): Promise<FullDashboardData> {
  // Fetch all data in parallel
  const [
    overview,
    userGrowth,
    roleDistribution,
    eventActivity,
    rsvpTrends,
    verificationQueue,
    extractionStats,
    festivalStats,
  ] = await Promise.all([
    getDashboardOverview(),
    getUserGrowth(30),
    getRoleDistribution(),
    getEventActivity(30),
    getRsvpTrends(30),
    getVerificationQueueStats(),
    getExtractionStats(),
    getFestivalStats(),
  ]);

  return {
    overview,
    userGrowth,
    roleDistribution,
    eventActivity,
    rsvpTrends,
    verificationQueue,
    extractionStats,
    festivalStats,
  };
}
