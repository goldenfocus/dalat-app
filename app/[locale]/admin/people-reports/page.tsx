import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/lib/i18n/routing";
import { isPeopleEnabled } from "@/lib/people/constants";
import { PeopleReportReview } from "@/components/admin/people-report-review";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function PeopleReportsPage() {
  if (!isPeopleEnabled()) notFound();
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) notFound();
  const { data: staff, error: staffError } = await db.rpc("people_is_staff");
  if (staffError || !staff) notFound();
  const t = await getTranslations("people");
  const { data: reports, error } = await db.from("people_reports")
    .select("id,reporter_id,reported_user_id,reason,details,status,created_at")
    .eq("status", "open").order("created_at").limit(100);
  if (error) return <p role="alert">{t("unavailableDescription")}</p>;
  const ids = [...new Set((reports ?? []).flatMap((report) => [report.reporter_id, report.reported_user_id]))];
  const { data: profiles, error: profileError } = ids.length
    ? await db.from("profiles").select("id,display_name,username").in("id", ids)
    : { data: [], error: null };
  if (profileError) return <p role="alert">{t("unavailableDescription")}</p>;
  const identity = (id: string) => {
    const person = profiles?.find((profile) => profile.id === id);
    return <Link className="inline-flex min-h-11 items-center rounded-lg px-2 underline active:scale-95" href={`/${person?.username || id}`}>{person?.display_name || person?.username || t("emptyName")}</Link>;
  };
  return <div className="space-y-6">
    <h1 className="text-2xl font-semibold">{t("reportsTitle")}</h1>
    <h2 className="font-medium">{t("openReports")}</h2>
    {!reports?.length && <p className="text-muted-foreground">{t("noReports")}</p>}
    {reports?.map((report) => <article key={report.id} className="space-y-3 rounded-xl border p-5">
      <dl className="space-y-1 text-sm">
        <div className="flex flex-wrap items-center gap-2"><dt>{t("reportFrom")}</dt><dd>{identity(report.reporter_id)}</dd></div>
        <div className="flex flex-wrap items-center gap-2"><dt>{t("reportedPerson")}</dt><dd>{identity(report.reported_user_id)}</dd></div>
        <div className="flex flex-wrap gap-2"><dt>{t("reportReason")}</dt><dd>{t(`reportReasons.${report.reason}`)}</dd></div>
      </dl>
      {report.details && <p className="whitespace-pre-wrap break-words text-sm">{report.details}</p>}
      <PeopleReportReview id={report.id} />
    </article>)}
  </div>;
}
