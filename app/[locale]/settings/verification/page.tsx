import { redirect } from "next/navigation";
import { Link } from "@/lib/i18n/routing";
import { ArrowLeft, ShieldCheck, CheckCircle2, Clock, XCircle, HelpCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { VerificationRequestForm } from "@/components/settings/verification-request-form";
import type { VerificationRequest } from "@/lib/types";

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

export default async function VerificationPage() {
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
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="container flex h-14 items-center gap-4 mx-auto px-4">
            <Link
              href="/settings"
              className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </Link>
            <h1 className="font-semibold">Verification</h1>
          </div>
        </header>

        <main className="container max-w-2xl mx-auto px-4 py-8">
          <div className="text-center py-12 rounded-lg border bg-green-500/10 border-green-500/20">
            <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-green-500" />
            <h2 className="text-2xl font-bold mb-2 text-green-700 dark:text-green-300">
              You&apos;re Verified!
            </h2>
            <p className="text-green-600 dark:text-green-400 mb-6">
              Your organizer account has been verified. You can now create festivals and official events.
            </p>
            <div className="flex justify-center gap-4">
              <Link
                href="/admin/festivals/new"
                className="px-6 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
              >
                Create Festival
              </Link>
              <Link
                href="/admin"
                className="px-6 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors font-medium"
              >
                Go to Dashboard
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex h-14 items-center gap-4 mx-auto px-4">
          <Link
            href="/settings"
            className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Link>
          <h1 className="font-semibold">Organizer Verification</h1>
        </div>
      </header>

      <main className="container max-w-2xl mx-auto px-4 py-8">
        {/* Existing Request Status */}
        {existingRequest && (
          <div className="mb-8">
            <RequestStatusCard request={existingRequest} />
          </div>
        )}

        {/* Show form only if no pending request */}
        {(!existingRequest || existingRequest.status === "rejected") && (
          <>
            {/* Info Section */}
            <div className="mb-8 p-6 rounded-lg border bg-card">
              <div className="flex items-center gap-3 mb-4">
                <ShieldCheck className="h-8 w-8 text-primary" />
                <h2 className="text-xl font-bold">Become a Verified Organizer</h2>
              </div>
              <p className="text-muted-foreground mb-4">
                Verified organizers can create official festivals and events on DaLat.app.
                This is for legitimate organizations, venues, and event organizers in Đà Lạt.
              </p>
              <div className="grid gap-3 text-sm">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                  <span>Create and manage festivals with official branding</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                  <span>Your events get the &quot;Official&quot; badge and priority placement</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                  <span>Post updates and announcements to your festival followers</span>
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
            <p>You already have a pending verification request.</p>
            <p>Please wait for it to be reviewed.</p>
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

function RequestStatusCard({ request }: { request: VerificationRequest }) {
  const statusConfig = {
    pending: {
      icon: Clock,
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10",
      borderColor: "border-yellow-500/20",
      title: "Request Pending",
      description: "Your verification request is being reviewed.",
    },
    more_info_needed: {
      icon: HelpCircle,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/20",
      title: "More Information Needed",
      description: "Please provide additional information to complete your verification.",
    },
    approved: {
      icon: CheckCircle2,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
      borderColor: "border-green-500/20",
      title: "Request Approved",
      description: "Congratulations! Your verification has been approved.",
    },
    rejected: {
      icon: XCircle,
      color: "text-red-500",
      bgColor: "bg-red-500/10",
      borderColor: "border-red-500/20",
      title: "Request Rejected",
      description: "Your verification request was not approved.",
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
            <span className="font-medium">Organization:</span> {request.organizer_name}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Submitted {new Date(request.created_at).toLocaleDateString("en-US", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>

          {/* Admin notes / rejection reason */}
          {request.admin_notes && request.status === "more_info_needed" && (
            <div className="mt-4 p-3 rounded bg-background/50">
              <p className="text-sm font-medium mb-1">Requested Information:</p>
              <p className="text-sm">{request.admin_notes}</p>
            </div>
          )}
          {request.rejection_reason && (
            <div className="mt-4 p-3 rounded bg-background/50">
              <p className="text-sm font-medium mb-1">Reason:</p>
              <p className="text-sm">{request.rejection_reason}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
