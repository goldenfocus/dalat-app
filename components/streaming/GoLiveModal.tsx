"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Video } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface GoLiveModalProps {
  /** Trigger element - if not provided, renders a default button */
  trigger?: React.ReactNode;
  /** Called when modal opens */
  onOpen?: () => void;
}

export function GoLiveModal({ trigger, onOpen }: GoLiveModalProps) {
  const router = useRouter();
  const t = useTranslations("streaming");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleOpen() {
    triggerHaptic("selection");
    setOpen(true);
    setTitle("");
    setError(null);
    onOpen?.();
  }

  async function handleGoLive() {
    if (!title.trim()) return;

    setError(null);
    triggerHaptic("selection");

    startTransition(async () => {
      try {
        const response = await fetch("/api/streaming/quick-live", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title.trim() }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error || t("goLiveError"));
          return;
        }

        triggerHaptic("medium");
        setOpen(false);
        router.push(`/events/${data.eventSlug}/live/broadcast`);
      } catch {
        setError(t("goLiveError"));
      }
    });
  }

  return (
    <>
      {trigger ? (
        <div onClick={handleOpen}>{trigger}</div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleOpen}
          className="p-2 text-muted-foreground hover:text-foreground active:scale-95 transition-all rounded-md"
          aria-label={t("goLive")}
        >
          <Video className="w-5 h-5" />
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="w-5 h-5 text-destructive" />
              {t("goLive")}
            </DialogTitle>
            <DialogDescription>{t("goLiveDescription")}</DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <Input
              placeholder={t("goLivePlaceholder")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && title.trim() && !isPending) {
                  handleGoLive();
                }
              }}
              autoFocus
              className="text-base"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              className="px-3 py-2"
            >
              {tCommon("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleGoLive}
              disabled={!title.trim() || isPending}
              className="px-3 py-2"
            >
              {isPending ? t("goingLive") : t("goLive")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
