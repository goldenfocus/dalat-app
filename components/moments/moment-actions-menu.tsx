"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MoreHorizontal, Trash2, ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { triggerHaptic } from "@/lib/haptics";
import { useMomentPermissions } from "@/lib/hooks/use-moment-permissions";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface MomentActionsMenuProps {
  momentId: string;
  momentUserId: string;
  eventSlug: string;
  variant?: "dark" | "light";
  onDeleted?: () => void;
}

export function MomentActionsMenu({
  momentId,
  momentUserId,
  eventSlug,
  variant = "dark",
  onDeleted,
}: MomentActionsMenuProps) {
  const router = useRouter();
  const t = useTranslations("moments");
  const tCommon = useTranslations("common");
  const { isOwner, canModerate, isLoading } = useMomentPermissions(momentUserId);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isSettingCover, setIsSettingCover] = useState(false);

  // Don't render if loading or user has no permissions
  if (isLoading || (!isOwner && !canModerate)) {
    return null;
  }

  async function handleDelete() {
    triggerHaptic("selection");

    startTransition(async () => {
      const supabase = createClient();

      const rpcName = isOwner ? "delete_own_moment" : "remove_moment";
      const params = isOwner
        ? { p_moment_id: momentId }
        : { p_moment_id: momentId, p_reason: "Removed by moderator" };

      const { data, error } = await supabase.rpc(rpcName, params);

      if (error || !data?.ok) {
        console.error("Delete moment error:", error);
        triggerHaptic("error");
        toast.error(t("deleteError"));
        return;
      }

      triggerHaptic("medium");
      setShowDeleteDialog(false);
      toast.success(t("momentDeleted"));

      if (onDeleted) {
        onDeleted();
      } else {
        router.push(`/events/${eventSlug}/moments`);
        router.refresh();
      }
    });
  }

  async function handleSetCover() {
    setIsSettingCover(true);
    triggerHaptic("light");

    try {
      const response = await fetch(`/api/moments/${momentId}/cover`, {
        method: "POST",
      });

      if (response.ok) {
        triggerHaptic("success");
        toast.success(t("setAsCover"));
        router.refresh();
      } else {
        triggerHaptic("error");
        toast.error(t("deleteError"));
      }
    } catch {
      triggerHaptic("error");
      toast.error(t("deleteError"));
    } finally {
      setIsSettingCover(false);
    }
  }

  const isDark = variant === "dark";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "p-2 rounded-full transition-all active:scale-95",
              isDark
                ? "bg-white/10 hover:bg-white/20 text-white"
                : "hover:bg-muted text-muted-foreground hover:text-foreground"
            )}
            aria-label="More actions"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {/* Set as cover - moderators only */}
          {canModerate && (
            <DropdownMenuItem
              onClick={handleSetCover}
              disabled={isSettingCover}
            >
              {isSettingCover ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ImageIcon className="w-4 h-4 mr-2" />
              )}
              {t("setAsCover")}
            </DropdownMenuItem>
          )}

          {/* Delete */}
          <DropdownMenuItem
            onClick={() => {
              triggerHaptic("selection");
              setShowDeleteDialog(true);
            }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete confirmation dialog - rendered outside dropdown for z-index */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="text-destructive">
              {t("deleteTitle")}
            </DialogTitle>
            <DialogDescription>{t("deleteConfirm")}</DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              className="px-3 py-2"
            >
              {tCommon("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
              className="px-3 py-2"
            >
              {isPending ? t("deleting") : t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
