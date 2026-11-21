"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { DalatSearch } from "./dalat-search";

export function HeaderSearch({ rentalsLabel }: { rentalsLabel: string }) {
  const t = useTranslations("home");
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    const element = panel.current;
    if (!open || !element || !viewport) return;
    const fit = () => {
      if (viewport.scale === 1) {
        element.style.maxHeight = Math.floor(viewport.height) + "px";
      } else {
        element.style.removeProperty("max-height");
      }
    };
    fit();
    viewport.addEventListener("resize", fit);
    return () => viewport.removeEventListener("resize", fit);
  }, [open]);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" aria-label={t("search.globalPlaceholder")}
          className="grid size-10 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground">
          <Search className="size-5" aria-hidden="true" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-background/90 backdrop-blur-sm" />
        <Dialog.Content ref={panel} aria-describedby={undefined}
          className="fixed inset-x-0 top-0 z-[101] mx-auto max-h-[100dvh] w-full max-w-2xl overflow-y-auto overscroll-y-contain px-3 pb-4 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-0 sm:pt-8">
          <Dialog.Title className="sr-only">{t("search.globalPlaceholder")}</Dialog.Title>
          <DalatSearch rentalsLabel={rentalsLabel} onNavigate={() => setOpen(false)} endAction={
            <Dialog.Close asChild>
              <button type="button" aria-label={t("search.close")}
                className="grid size-10 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground">
                <X className="size-5" aria-hidden="true" />
              </button>
            </Dialog.Close>
          } />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
