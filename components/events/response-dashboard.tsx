"use client";

import { useState, useMemo } from "react";
import { Download, Users, BarChart3, List, User } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { triggerHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { Locale, MultilingualText, QuestionOption } from "@/lib/types";

interface QuestionResponse {
  question_id: string;
  question_text: MultilingualText;
  question_type: "single_choice" | "multi_choice" | "text";
  options: QuestionOption[] | null;
  responses: {
    user_id: string;
    user_name: string;
    user_avatar: string | null;
    value: string | string[];
    created_at: string;
  }[];
}

interface ResponseDashboardProps {
  eventTitle: string;
  totalResponses: number;
  totalRsvps: number;
  questions: QuestionResponse[];
}

// Helper to get localized text
function getLocalizedText(text: MultilingualText | null | undefined, locale: Locale): string {
  if (!text) return "";
  return text[locale] || text.en || Object.values(text)[0] || "";
}

// Helper to get option label
function getOptionLabel(options: QuestionOption[] | null, value: string, locale: Locale): string {
  if (!options) return value;
  const option = options.find((o) => o.value === value);
  return option ? getLocalizedText(option.label, locale) : value;
}

export function ResponseDashboard({
  eventTitle,
  totalResponses,
  totalRsvps,
  questions,
}: ResponseDashboardProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations("responseDashboard");
  const [viewMode, setViewMode] = useState<"summary" | "individual">("summary");

  // Calculate summary stats for choice questions
  const questionSummaries = useMemo(() => {
    return questions.map((q) => {
      if (q.question_type === "text") {
        return {
          ...q,
          summary: null,
          textResponses: q.responses.map((r) => ({
            userName: r.user_name,
            userAvatar: r.user_avatar,
            text: Array.isArray(r.value) ? r.value.join(", ") : r.value,
          })),
        };
      }

      // Count responses for each option
      const counts: Record<string, number> = {};
      q.responses.forEach((r) => {
        const values = Array.isArray(r.value) ? r.value : [r.value];
        values.forEach((v) => {
          counts[v] = (counts[v] || 0) + 1;
        });
      });

      // Calculate percentages
      const total = q.responses.length;
      const summary = (q.options || []).map((opt) => ({
        value: opt.value,
        label: getLocalizedText(opt.label, locale),
        count: counts[opt.value] || 0,
        percentage: total > 0 ? Math.round(((counts[opt.value] || 0) / total) * 100) : 0,
      }));

      return {
        ...q,
        summary,
        textResponses: null,
      };
    });
  }, [questions, locale]);

  // Generate CSV data
  const generateCSV = () => {
    triggerHaptic("selection");

    // Build header row
    const headers = ["User", "Email", "Submitted At"];
    questions.forEach((q) => {
      headers.push(getLocalizedText(q.question_text, locale));
    });

    // Build data rows (pivot by user)
    const userResponses = new Map<string, Record<string, string>>();

    questions.forEach((q) => {
      q.responses.forEach((r) => {
        if (!userResponses.has(r.user_id)) {
          userResponses.set(r.user_id, {
            userName: r.user_name,
            submittedAt: r.created_at,
          });
        }
        const value = Array.isArray(r.value)
          ? r.value.map((v) => getOptionLabel(q.options, v, locale)).join("; ")
          : q.question_type !== "text"
            ? getOptionLabel(q.options, r.value, locale)
            : r.value;
        userResponses.get(r.user_id)![q.question_id] = value;
      });
    });

    // Convert to CSV rows
    const rows = Array.from(userResponses.entries()).map(([userId, data]) => {
      const row = [
        data.userName,
        "", // Email not available in this context
        new Date(data.submittedAt).toLocaleString(),
      ];
      questions.forEach((q) => {
        row.push(data[q.question_id] || "");
      });
      return row;
    });

    // Create CSV content
    const escapeCSV = (str: string) => {
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvContent = [
      headers.map(escapeCSV).join(","),
      ...rows.map((row) => row.map(escapeCSV).join(",")),
    ].join("\n");

    // Download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${eventTitle.replace(/[^a-z0-9]/gi, "_")}_responses.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
          <div className="flex items-center gap-2 text-primary mb-1">
            <Users className="w-4 h-4" />
            <span className="text-sm font-medium">{t("responses")}</span>
          </div>
          <p className="text-2xl font-bold text-primary">{totalResponses}</p>
          <p className="text-xs text-muted-foreground">
            {t("ofRsvps", { total: totalRsvps })}
          </p>
        </div>
        <div className="p-4 bg-muted rounded-lg border">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <BarChart3 className="w-4 h-4" />
            <span className="text-sm font-medium">{t("questions")}</span>
          </div>
          <p className="text-2xl font-bold">{questions.length}</p>
          <p className="text-xs text-muted-foreground">{t("totalQuestions")}</p>
        </div>
      </div>

      {/* View Toggle & Export */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          <button
            type="button"
            onClick={() => {
              triggerHaptic("selection");
              setViewMode("summary");
            }}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              viewMode === "summary"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <BarChart3 className="w-4 h-4" />
            {t("summary")}
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic("selection");
              setViewMode("individual");
            }}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              viewMode === "individual"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <List className="w-4 h-4" />
            {t("individual")}
          </button>
        </div>
        <Button variant="outline" size="sm" onClick={generateCSV} className="gap-2">
          <Download className="w-4 h-4" />
          {t("exportCSV")}
        </Button>
      </div>

      {/* No responses */}
      {totalResponses === 0 && (
        <div className="p-8 border border-dashed rounded-lg text-center">
          <Users className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">{t("noResponses")}</p>
        </div>
      )}

      {/* Summary View */}
      {viewMode === "summary" && totalResponses > 0 && (
        <div className="space-y-6">
          {questionSummaries.map((q, index) => (
            <div key={q.question_id} className="p-4 border rounded-lg">
              <p className="text-sm font-medium mb-3">
                {index + 1}. {getLocalizedText(q.question_text, locale)}
              </p>

              {q.summary && (
                <div className="space-y-2">
                  {q.summary.map((item) => (
                    <div key={item.value} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>{item.label}</span>
                        <span className="text-muted-foreground">
                          {item.count} ({item.percentage}%)
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-500"
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {q.textResponses && (
                <div className="space-y-2">
                  {q.textResponses.slice(0, 5).map((response, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 p-2 bg-muted/50 rounded-lg"
                    >
                      {response.userAvatar ? (
                        <img
                          src={response.userAvatar}
                          alt=""
                          className="w-6 h-6 rounded-full"
                        />
                      ) : (
                        <div className="w-6 h-6 bg-muted rounded-full flex items-center justify-center">
                          <User className="w-3 h-3 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground mb-0.5">
                          {response.userName}
                        </p>
                        <p className="text-sm">{response.text}</p>
                      </div>
                    </div>
                  ))}
                  {q.textResponses.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center">
                      {t("andMore", { count: q.textResponses.length - 5 })}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Individual View */}
      {viewMode === "individual" && totalResponses > 0 && (
        <div className="space-y-4">
          {/* Group responses by user */}
          {Array.from(
            new Map(
              questions
                .flatMap((q) => q.responses)
                .map((r) => [r.user_id, r])
            ).values()
          ).map((user) => (
            <div key={user.user_id} className="p-4 border rounded-lg">
              <div className="flex items-center gap-3 mb-4 pb-3 border-b">
                {user.user_avatar ? (
                  <img
                    src={user.user_avatar}
                    alt=""
                    className="w-10 h-10 rounded-full"
                  />
                ) : (
                  <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <p className="font-medium">{user.user_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString(locale, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                {questions.map((q) => {
                  const response = q.responses.find((r) => r.user_id === user.user_id);
                  if (!response) return null;

                  const displayValue = Array.isArray(response.value)
                    ? response.value
                        .map((v) => getOptionLabel(q.options, v, locale))
                        .join(", ")
                    : q.question_type !== "text"
                      ? getOptionLabel(q.options, response.value, locale)
                      : response.value;

                  return (
                    <div key={q.question_id}>
                      <p className="text-xs text-muted-foreground mb-1">
                        {getLocalizedText(q.question_text, locale)}
                      </p>
                      <p className="text-sm">{displayValue}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
