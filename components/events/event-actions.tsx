"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface EventActionsProps {
  eventId: string;
  eventSlug: string;
}

export function EventActions({ eventId, eventSlug }: EventActionsProps) {
  const router = useRouter();
  const t = useTranslations("eventActions");
  const tCommon = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);

  function handleEdit() {
    router.push(`/events/${eventSlug}/edit`);
  }

  function handleCreateSimilar() {
    router.push(`/events/new?copyFrom=${eventId}`);
  }

  function handleDelete() {
    if (!showConfirm) {
      setShowConfirm(true);
      return;
    }

    const supabase = createClient();

    startTransition(async () => {
      const { error } = await supabase
        .from("events")
        .delete()
        .eq("id", eventId);

      if (error) {
        console.error("Failed to delete event:", error);
        setShowConfirm(false);
        return;
      }

      router.push("/");
      router.refresh();
    });
  }

  if (showConfirm) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{t("deleteConfirm")}</span>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          disabled={isPending}
        >
          {isPending ? t("deleting") : tCommon("yes")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowConfirm(false)}
          disabled={isPending}
        >
          {tCommon("no")}
        </Button>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="w-5 h-5" />
          <span className="sr-only">{t("eventOptions")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleEdit}>
          <Pencil className="w-4 h-4 mr-2" />
          {t("editEvent")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCreateSimilar}>
          <Copy className="w-4 h-4 mr-2" />
          {t("createSimilar")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleDelete}
          className="text-red-600 focus:text-red-600"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          {t("deleteEvent")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
