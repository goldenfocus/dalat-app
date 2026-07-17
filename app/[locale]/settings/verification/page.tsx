import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";
import { ShieldCheck, CheckCircle2, Clock, XCircle, HelpCircle, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { VerificationRequestForm } from "@/components/settings/verification-request-form";
import type { VerificationRequest } from "@/lib/types";

// Force dynamic rendering to ensure correct locale translations
export const dynamic = "force-dynamic";

async function getExistingRequest(userId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("verification_requests")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return data as VerificationRequest | null;
}

async function getProfile(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  return data;
}

export default async function VerificationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("settings.verification");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [profile, existingRequest] = await Promise.all([
    getProfile(user.id),
    getExistingRequest(user.id),
  ]);

  // Already verified
  if (profile?.role === "organizer_verified") {
    return (
      <div className="min-h-screen">
        <main className="container max-w-2xl mx-auto px-4 py-8">
          <h1 className="text-xl font-semibold mb-8">{t("title")}</h1>
          <div className="text-center py-12 rounded-lg border bg-green-500/10 border-green-500/20">
            <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-green-500" />
            <h2 className="text-2xl font-bold mb-2 text-green-700 dark:text-green-300">
              {t("verifiedTitle")}
            </h2>
            <p className="text-green-600 dark:text-green-400 mb-6">
              {t("verifiedDescription")}
            </p>
            <div className="flex justify-center gap-4">
              <Link
                href="/admin/festivals/new"
                className="px-6 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
              >
                {t("createFestival")}
              </Link>
              <Link
                href="/admin"
                className="px-6 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors font-medium"
              >
                {t("goToDashboard")}
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <main className="container max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-xl font-semibold mb-8">{t("pageTitle")}</h1>
        {/* Existing Request Status */}
        {existingRequest && (
          <div className="mb-8">
            <RequestStatusCard request={existingRequest} locale={locale} />
          </div>
        )}

        {/* Show form only if no pending request */}
        {(!existingRequest || existingRequest.status === "rejected") && (
          <>
            {/* Info Section */}
            <div className="mb-8 p-6 rounded-lg border bg-card">
              <div className="flex items-center gap-3 mb-4">
                <ShieldCheck className="h-8 w-8 text-primary" />
                <h2 className="text-xl font-bold">{t("becomeVerified")}</h2>
              </div>
              <p className="text-muted-foreground mb-4">
                {t("intro")}
              </p>
              <div className="grid gap-3 text-sm">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                  <span>{t("benefitFestivals")}</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                  <span>{t("benefitBadge")}</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                  <span>{t("benefitAnnouncements")}</span>
                </div>
              </div>
            </div>

            {/* Request Form */}
            <VerificationRequestForm userId={user.id} />
          </>
        )}

        {/* Can't submit new request if one is pending */}
        {existingRequest && existingRequest.status === "pending" && (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{t("pendingNotice")}</p>
            <p>{t("pendingWait")}</p>
          </div>
        )}

        {/* Need to respond to more info request */}
        {existingRequest && existingRequest.status === "more_info_needed" && (
          <VerificationRequestForm
            userId={user.id}
            existingRequest={existingRequest}
          />
        )}
      </main>
    </div>
  );
}

async function RequestStatusCard({
  request,
  locale,
}: {
  request: VerificationRequest;
  locale: string;
}) {
  const t = await getTranslations("settings.verification");
  const statusConfig = {
    pending: {
      icon: Clock,
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10",
      borderColor: "border-yellow-500/20",
      title: t("status.pending.title"),
      description: t("status.pending.description"),
    },
    more_info_needed: {
      icon: HelpCircle,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/20",
      title: t("status.more_info_needed.title"),
      description: t("status.more_info_needed.description"),
    },
    approved: {
      icon: CheckCircle2,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
      borderColor: "border-green-500/20",
      title: t("status.approved.title"),
      description: t("status.approved.description"),
    },
    rejected: {
      icon: XCircle,
      color: "text-red-500",
      bgColor: "bg-red-500/10",
      borderColor: "border-red-500/20",
      title: t("status.rejected.title"),
      description: t("status.rejected.description"),
    },
  };

  const config = statusConfig[request.status];
  const Icon = config.icon;

  return (
    <div className={`p-6 rounded-lg ${config.bgColor} border ${config.borderColor}`}>
      <div className="flex items-start gap-4">
        <Icon className={`h-8 w-8 ${config.color} flex-shrink-0`} />
        <div className="flex-1">
          <h3 className={`font-semibold mb-1 ${config.color}`}>{config.title}</h3>
          <p className="text-sm text-muted-foreground mb-2">{config.description}</p>
          <p className="text-sm">
            <span className="font-medium">{t("organizationLabel")}</span> {request.organizer_name}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            {t("submittedDate", {
              date: new Date(request.created_at).toLocaleDateString(locale, {
                day: "numeric",
                month: "short",
                year: "numeric",
              }),
            })}
          </p>

          {/* Admin notes / rejection reason */}
          {request.admin_notes && request.status === "more_info_needed" && (
            <div className="mt-4 p-3 rounded bg-background/50">
              <p className="text-sm font-medium mb-1">{t("requestedInformation")}</p>
              <p className="text-sm">{request.admin_notes}</p>
            </div>
          )}
          {request.rejection_reason && (
            <div className="mt-4 p-3 rounded bg-background/50">
              <p className="text-sm font-medium mb-1">{t("reasonLabel")}</p>
              <p className="text-sm">{request.rejection_reason}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
