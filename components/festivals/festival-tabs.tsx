"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, MessageSquare, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Festival, FestivalEvent, FestivalUpdate } from "@/lib/types";

interface FestivalTabsProps {
  festival: Festival;
  officialEvents: (FestivalEvent & { events: NonNullable<FestivalEvent["events"]> })[];
  communityEvents: (FestivalEvent & { events: NonNullable<FestivalEvent["events"]> })[];
  updates: FestivalUpdate[];
}

type Tab = "program" | "updates" | "about";

export function FestivalTabs({
  festival,
  officialEvents,
  communityEvents,
  updates,
}: FestivalTabsProps) {
  const t = useTranslations("festival");
  const locale = useLocale();
  const [activeTab, setActiveTab] = useState<Tab>("program");
  const totalEvents = officialEvents.length + communityEvents.length;

  const tabs = [
    { id: "program" as Tab, label: t("tabs.program"), icon: Calendar },
    { id: "updates" as Tab, label: t("tabs.updates"), icon: MessageSquare },
    { id: "about" as Tab, label: t("tabs.about"), icon: Info },
  ];

  return (
    <div className="w-full">
      <div className="grid w-full grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === "program" && (
        <div className="mt-6 space-y-6">
        {totalEvents === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              {t("noEventsYet")}
            </CardContent>
          </Card>
        ) : (
          <>
            {officialEvents.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">{t("officialProgram")}</h3>
                <div className="space-y-3">
                  {officialEvents.map((fe) => (
                    <Card key={fe.event_id}>
                      <CardContent className="p-4">
                        <div className="font-medium">{fe.events.title}</div>
                        {fe.events.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {fe.events.description}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {communityEvents.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">{t("communitySideEvents")}</h3>
                <div className="space-y-3">
                  {communityEvents.map((fe) => (
                    <Card key={fe.event_id}>
                      <CardContent className="p-4">
                        <div className="font-medium">{fe.events.title}</div>
                        {fe.events.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {fe.events.description}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        </div>
      )}

      {activeTab === "updates" && (
        <div className="mt-6 space-y-4">
          {updates.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                {t("noUpdatesYet")}
              </CardContent>
            </Card>
          ) : (
            updates.map((update) => (
              <Card key={update.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{update.title}</CardTitle>
                  <CardDescription>
                    {new Date(update.posted_at).toLocaleDateString(locale)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{update.body}</p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === "about" && (
        <div className="mt-6">
          <Card>
            <CardContent className="p-6 space-y-4">
              {festival.description && (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  {festival.description}
                </div>
              )}
              {!festival.description && (
                <p className="text-muted-foreground text-center">
                  {t("moreDetailsSoon")}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
