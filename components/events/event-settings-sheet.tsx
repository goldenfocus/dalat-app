"use client";

import { useState } from "react";
import { Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EventSettingsForm } from "./event-settings-form";
import type { EventSettings } from "@/lib/types";

interface EventSettingsSheetProps {
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  eventDescription: string | null;
  startsAt: string;
  endsAt: string | null;
  initialSettings: EventSettings | null;
  pendingCount: number;
}

/**
 * Settings sheet accessible from event page header.
 * Contains moments config, moderation settings, and retranslate.
 */
export function EventSettingsSheet({
  eventId,
  eventSlug,
  eventTitle,
  eventDescription,
  startsAt,
  endsAt,
  initialSettings,
  pendingCount,
}: EventSettingsSheetProps) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("eventSettings");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label={t("title")}
        >
          <Settings className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <EventSettingsForm
          eventId={eventId}
          eventSlug={eventSlug}
          eventTitle={eventTitle}
          eventDescription={eventDescription}
          startsAt={startsAt}
          endsAt={endsAt}
          initialSettings={initialSettings}
          pendingCount={pendingCount}
        />
      </DialogContent>
    </Dialog>
  );
}
