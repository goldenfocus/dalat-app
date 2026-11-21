"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type Feedback = "active" | "failed" | null;

export function DeleteRentalListing({ remove }: { remove: () => Promise<Feedback> }) {
  const t = useTranslations("rentalsPilot");
  const common = useTranslations("common");

  return <AlertDialog>
    <AlertDialogTrigger asChild>
      <button className="min-h-11 rounded-lg px-3 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
        {t("deleteListing")}
      </button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
        <AlertDialogDescription>{t("deleteDescription")}</AlertDialogDescription>
      </AlertDialogHeader>
      <DeleteForm remove={remove} cancelLabel={common("cancel")} />
    </AlertDialogContent>
  </AlertDialog>;
}

function DeleteForm({ remove, cancelLabel }: { remove: () => Promise<Feedback>; cancelLabel: string }) {
  const t = useTranslations("rentalsPilot");
  const [feedback, submit, pending] = useActionState<Feedback, FormData>(remove, null);

  return <form action={submit} className="space-y-4">
    {feedback && <p role="alert" className="text-sm">{t(feedback === "active" ? "deleteActive" : "failed")}</p>}
    <AlertDialogFooter>
      <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
      <Button type="submit" disabled={pending} variant="destructive">{t("deleteListing")}</Button>
    </AlertDialogFooter>
  </form>;
}
