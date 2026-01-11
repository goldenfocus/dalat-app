import { Link } from "@/lib/i18n/routing";
import {
  Building2,
  Sparkles,
  Calendar,
  Users,
  Bell,
  PartyPopper,
  ShieldCheck,
} from "lucide-react";
import { getFullDashboardData } from "@/lib/admin/analytics";
import {
  StatCard,
  UserGrowthChart,
  RoleDistributionChart,
  EventActivityChart,
  RsvpTrendsChart,
  VerificationQueueCard,
} from "@/components/admin/analytics";

export default async function AdminDashboard() {
  const dashboardData = await getFullDashboardData();
  const { overview } = dashboardData;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="mt-2 text-muted-foreground">
          Platform analytics, verification queue, and management tools.
        </p>
      </div>

      {/* Summary Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Users"
          value={overview?.users?.total ?? 0}
          subtitle={`+${overview?.users?.new_this_week ?? 0} this week`}
          icon={Users}
          trend={
            overview?.users?.new_this_week
              ? {
                  value: Math.round(
                    ((overview.users.new_this_week / Math.max(overview.users.total - overview.users.new_this_week, 1)) * 100)
                  ),
                  label: "vs last week",
                }
              : undefined
          }
        />
        <StatCard
          title="Published Events"
          value={overview?.events?.published ?? 0}
          subtitle={`${overview?.events?.draft ?? 0} drafts`}
          icon={Calendar}
        />
        <StatCard
          title="Total RSVPs"
          value={overview?.rsvps?.total ?? 0}
          subtitle={`${overview?.rsvps?.going ?? 0} going`}
          icon={PartyPopper}
        />
        <StatCard
          title="Push Notifications"
          value={overview?.notifications?.users_with_push ?? 0}
          subtitle="Users with notifications enabled"
          icon={Bell}
        />
      </div>

      {/* Verification Queue Alert (if pending) */}
      {overview?.verification_queue?.pending ? (
        <div className="rounded-lg border-2 border-yellow-500/50 bg-yellow-500/10 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
              <div>
                <p className="font-semibold text-yellow-700 dark:text-yellow-300">
                  {overview.verification_queue.pending} Pending Verification
                  Request{overview.verification_queue.pending !== 1 ? "s" : ""}
                </p>
                <p className="text-sm text-yellow-600 dark:text-yellow-400">
                  Organizers are waiting for approval
                </p>
              </div>
            </div>
            <Link
              href="/admin/verifications"
              className="rounded-md bg-yellow-500 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-600 transition-colors"
            >
              Review Now
            </Link>
          </div>
        </div>
      ) : null}

      {/* Charts Row 1: User Growth + Role Distribution */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <UserGrowthChart data={dashboardData.userGrowth} />
        </div>
        <RoleDistributionChart data={dashboardData.roleDistribution} />
      </div>

      {/* Charts Row 2: Event Activity + RSVP Trends */}
      <div className="grid gap-4 md:grid-cols-2">
        <EventActivityChart data={dashboardData.eventActivity} />
        <RsvpTrendsChart data={dashboardData.rsvpTrends} />
      </div>

      {/* Verification Queue Stats */}
      <VerificationQueueCard stats={dashboardData.verificationQueue} />

      {/* Festival & Organizer Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-primary/10 p-3">
              <PartyPopper className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Festivals
              </p>
              <p className="text-2xl font-bold">
                {dashboardData.festivalStats?.total_festivals ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">
                {dashboardData.festivalStats?.active_festivals ?? 0} active
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-primary/10 p-3">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Organizers
              </p>
              <p className="text-2xl font-bold">
                {overview?.organizers?.total ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">
                {overview?.organizers?.verified ?? 0} verified
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-primary/10 p-3">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                AI Extractions
              </p>
              <p className="text-2xl font-bold">
                {dashboardData.extractionStats?.total_extractions ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">
                {dashboardData.extractionStats?.success_rate ?? 0}% success rate
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/organizers/new"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Building2 className="h-4 w-4" />
            Add Organizer
          </Link>
          <Link
            href="/admin/extract"
            className="inline-flex items-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            <Sparkles className="h-4 w-4" />
            Extract from Poster
          </Link>
          <Link
            href="/admin/festivals/new"
            className="inline-flex items-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            <PartyPopper className="h-4 w-4" />
            Create Festival
          </Link>
          <Link
            href="/admin/verifications"
            className="inline-flex items-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            <ShieldCheck className="h-4 w-4" />
            Review Verifications
          </Link>
        </div>
      </div>
    </div>
  );
}
