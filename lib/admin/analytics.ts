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
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_event_activity", {
      days_back: daysBack,
    });

    if (error) {
      console.error("Error fetching event activity:", error);
      return [];
    }

    return (data ?? []) as EventActivityData[];
  } catch (e) {
    console.error("Exception fetching event activity:", e);
    return [];
  }
}

// ============================================
// RSVP Analytics
// ============================================

export async function getRsvpTrends(daysBack = 30): Promise<RsvpTrendsData[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_rsvp_trends", {
      days_back: daysBack,
    });

    if (error) {
      console.error("Error fetching RSVP trends:", error);
      return [];
    }

    return (data ?? []) as RsvpTrendsData[];
  } catch (e) {
    console.error("Exception fetching RSVP trends:", e);
    return [];
  }
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
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_verification_queue_stats");

    if (error) {
      console.error("Error fetching verification queue stats:", error);
      return null;
    }

    // RPC returns array with single row
    return data?.[0] ?? null;
  } catch (e) {
    console.error("Exception fetching verification queue stats:", e);
    return null;
  }
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
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_festival_stats");

    if (error) {
      console.error("Error fetching festival stats:", error);
      return null;
    }

    return data?.[0] ?? null;
  } catch (e) {
    console.error("Exception fetching festival stats:", e);
    return null;
  }
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
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_notification_stats");

    if (error) {
      console.error("Error fetching notification stats:", error);
      return null;
    }

    return data?.[0] ?? null;
  } catch (e) {
    console.error("Exception fetching notification stats:", e);
    return null;
  }
}

// ============================================
// Session Analytics
// ============================================

export interface SessionStats {
  total_logins: number;
  active_today: number;
  last_login_at: string | null;
}

export async function getSessionStats(): Promise<SessionStats | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_session_stats");

    if (error) {
      console.error("Error fetching session stats:", error);
      return null;
    }

    return data?.[0] ?? null;
  } catch (e) {
    console.error("Exception fetching session stats:", e);
    return null;
  }
}

// ============================================
// Daily Summary (quick glance stats)
// ============================================

export interface DailySummary {
  newUsers: number;
  eventsScraped: number;
  eventsCreated: number;
  rsvpsToday: number;
  commentsToday: number;
  momentsToday: number;
  activeUsers: number;
}

export async function getDailySummary(): Promise<DailySummary> {
  try {
    const supabase = await createClient();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    // Fetch all stats in parallel
    const [
      usersResult,
      scrapedEventsResult,
      createdEventsResult,
      rsvpsResult,
      commentsResult,
      momentsResult,
    ] = await Promise.all([
      // New users today
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayISO),
      // Events scraped today (from automated sources)
      supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayISO)
        .not("source_platform", "is", null),
      // Events created by users today
      supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayISO)
        .is("source_platform", null),
      // RSVPs today
      supabase
        .from("rsvps")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayISO)
        .eq("status", "going"),
      // Comments today
      supabase
        .from("comments")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayISO),
      // Moments today
      supabase
        .from("moments")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayISO),
    ]);

    return {
      newUsers: usersResult.count ?? 0,
      eventsScraped: scrapedEventsResult.count ?? 0,
      eventsCreated: createdEventsResult.count ?? 0,
      rsvpsToday: rsvpsResult.count ?? 0,
      commentsToday: commentsResult.count ?? 0,
      momentsToday: momentsResult.count ?? 0,
      activeUsers: 0, // Could add session tracking later
    };
  } catch (e) {
    console.error("Exception fetching daily summary:", e);
    return {
      newUsers: 0,
      eventsScraped: 0,
      eventsCreated: 0,
      rsvpsToday: 0,
      commentsToday: 0,
      momentsToday: 0,
      activeUsers: 0,
    };
  }
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
  festivalStats: FestivalStats | null;
  sessionStats: SessionStats | null;
}

export async function getFullDashboardData(): Promise<FullDashboardData> {
  try {
    // Fetch all data in parallel
    const [
      overview,
      userGrowth,
      roleDistribution,
      eventActivity,
      rsvpTrends,
      verificationQueue,
      festivalStats,
      sessionStats,
    ] = await Promise.all([
      getDashboardOverview(),
      getUserGrowth(30),
      getRoleDistribution(),
      getEventActivity(30),
      getRsvpTrends(30),
      getVerificationQueueStats(),
      getFestivalStats(),
      getSessionStats(),
    ]);

    return {
      overview,
      userGrowth,
      roleDistribution,
      eventActivity,
      rsvpTrends,
      verificationQueue,
      festivalStats,
      sessionStats,
    };
  } catch (e) {
    console.error("Exception fetching full dashboard data:", e);
    // Return empty/null values on error
    return {
      overview: null,
      userGrowth: [],
      roleDistribution: [],
      eventActivity: [],
      rsvpTrends: [],
      verificationQueue: null,
      festivalStats: null,
      sessionStats: null,
    };
  }
}
