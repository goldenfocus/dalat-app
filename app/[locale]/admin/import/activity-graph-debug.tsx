"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Activity,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface GraphSource {
  id: string;
  slug: string;
  name: string;
  status: "active" | "paused" | "blocked" | "degraded";
  auto_publish_enabled: boolean;
  auto_publish_threshold: number;
  last_success_at: string | null;
  next_check_at: string;
  error_detail: string | null;
}

interface EvidenceRow {
  field_path: string;
  normalized_value: unknown;
  evidence_text: string | null;
  evidence_locator: string | null;
  confidence: number;
}

interface GraphCandidate {
  id: string;
  title: string;
  activity_kind: string;
  source_url: string;
  starts_at: string | null;
  rrule: string | null;
  starts_at_time: string | null;
  location_name: string | null;
  confidence_score: number;
  freshness_score: number;
  duplicate_status: string;
  duplicate_matches: Array<{ title?: string; score?: number; reason?: string }>;
  decision: string;
  decision_reason: string;
  status: string;
  last_checked_at: string;
  last_confirmed_at: string | null;
  evidence: EvidenceRow[];
  source: GraphSource | null;
  canonicalLink: {
    event_id: string | null;
    event_series_id: string | null;
  } | null;
}

interface GraphPayload {
  candidates: GraphCandidate[];
  sources: GraphSource[];
  stats: {
    total: number;
    published: number;
    withheld: number;
    unlisted: number;
    errors: number;
  };
}

function formatWhen(candidate: GraphCandidate, locale: string): string {
  if (candidate.starts_at) {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date(candidate.starts_at));
  }
  if (candidate.rrule && candidate.starts_at_time) {
    return `${candidate.rrule} · ${candidate.starts_at_time.slice(0, 5)}`;
  }
  return "—";
}

export function ActivityGraphDebug() {
  const t = useTranslations("adminActivityGraph");
  const locale = useLocale();
  const [data, setData] = useState<GraphPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/activity-graph", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(t("loadError"));
      setData(await response.json());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(body: Record<string, string>) {
    const key = body.candidateId ?? body.sourceId;
    setActing(key);
    setError(null);
    try {
      const response = await fetch("/api/admin/activity-graph", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(t("actionError"));
      await load();
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : t("actionError"),
      );
    } finally {
      setActing(null);
    }
  }

  return (
    <Card className="border-emerald-500/30 bg-emerald-500/[0.03]">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-600" />
              {t("title")}
            </CardTitle>
            <CardDescription className="mt-1 max-w-3xl">
              {t("description")}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {t("refresh")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}

        {loading && !data ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {t("loading")}
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {(
                [
                  "total",
                  "published",
                  "withheld",
                  "unlisted",
                  "errors",
                ] as const
              ).map((key) => (
                <div key={key} className="rounded-lg border bg-background p-3">
                  <div className="text-2xl font-semibold tabular-nums">
                    {data.stats[key]}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t(`stats.${key}`)}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                {t("sources")}
              </h3>
              <div className="grid gap-2 lg:grid-cols-2">
                {data.sources.map((source) => (
                  <div
                    key={source.id}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{source.name}</span>
                        <Badge
                          variant={
                            source.status === "active" ? "default" : "secondary"
                          }
                        >
                          {source.status}
                        </Badge>
                        {source.auto_publish_enabled && (
                          <Badge variant="outline">
                            {t("threshold", {
                              score: source.auto_publish_threshold,
                            })}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {source.error_detail ||
                          (source.last_success_at
                            ? t("lastSuccess", {
                                date: new Date(
                                  source.last_success_at,
                                ).toLocaleString(locale),
                              })
                            : t("notRun"))}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={acting === source.id}
                      onClick={() =>
                        void act({
                          action:
                            source.status === "active"
                              ? "pause_source"
                              : "resume_source",
                          sourceId: source.id,
                        })
                      }
                    >
                      {source.status === "active" ? (
                        <Pause className="mr-1.5 h-3.5 w-3.5" />
                      ) : (
                        <Play className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {source.status === "active" ? t("pause") : t("resume")}
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">{t("decisions")}</h3>
              {data.candidates.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  {t("empty")}
                </div>
              ) : (
                data.candidates.map((candidate) => (
                  <div
                    key={candidate.id}
                    className="rounded-lg border bg-background p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">
                            {candidate.title}
                          </span>
                          <Badge
                            variant={
                              candidate.status === "published"
                                ? "default"
                                : candidate.status === "unlisted"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {candidate.status}
                          </Badge>
                          <Badge variant="outline">
                            {candidate.activity_kind}
                          </Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            {candidate.source?.name ?? t("unknownSource")}
                          </span>
                          <span>{formatWhen(candidate, locale)}</span>
                          {candidate.location_name && (
                            <span>{candidate.location_name}</span>
                          )}
                          <span>
                            {t("confidence", {
                              score: candidate.confidence_score,
                            })}
                          </span>
                          <span>
                            {t("freshness", {
                              score: candidate.freshness_score,
                            })}
                          </span>
                        </div>
                        <p className="mt-2 text-sm">
                          {candidate.decision_reason}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={candidate.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md border p-2 text-muted-foreground hover:text-foreground"
                          aria-label={t("openSource")}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                        {candidate.status === "published" ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={acting === candidate.id}
                            onClick={() => {
                              if (
                                window.confirm(
                                  t("unlistConfirm", {
                                    title: candidate.title,
                                  }),
                                )
                              ) {
                                void act({
                                  action: "unlist",
                                  candidateId: candidate.id,
                                });
                              }
                            }}
                          >
                            {t("unlist")}
                          </Button>
                        ) : candidate.status !== "unlisted" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={acting === candidate.id}
                            onClick={() =>
                              void act({
                                action: "recheck",
                                candidateId: candidate.id,
                              })
                            }
                          >
                            {t("recheck")}
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    <details className="mt-3 rounded-md bg-muted/40 p-3 text-sm">
                      <summary className="cursor-pointer font-medium">
                        {t("evidence", { count: candidate.evidence.length })}
                      </summary>
                      <div className="mt-3 grid gap-2">
                        {candidate.evidence.map((row) => (
                          <div
                            key={`${row.field_path}-${row.evidence_locator}`}
                            className="grid gap-1 border-l-2 border-emerald-500/40 pl-3 sm:grid-cols-[10rem_1fr]"
                          >
                            <span className="font-mono text-xs">
                              {row.field_path} · {row.confidence}
                            </span>
                            <span className="break-words text-xs text-muted-foreground">
                              {row.evidence_text ||
                                JSON.stringify(row.normalized_value)}
                            </span>
                          </div>
                        ))}
                        {candidate.duplicate_matches.length > 0 && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {t("duplicate", {
                              title:
                                candidate.duplicate_matches[0]?.title ?? "—",
                              score: candidate.duplicate_matches[0]?.score ?? 0,
                            })}
                          </div>
                        )}
                      </div>
                    </details>
                  </div>
                ))
              )}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
