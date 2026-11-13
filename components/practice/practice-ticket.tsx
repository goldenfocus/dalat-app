"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import Image from "next/image";
import type { Person } from "@/lib/practice/model";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/** Private, short-lived guest receipt. The token stays in the URL fragment. */
export function PracticeTicket({
  person,
  ticket,
  onClose,
}: {
  person: Person;
  ticket: (id: string) => Promise<string>;
  onClose: () => void;
}) {
  const t = useTranslations("eventPractice");
  const [qr, setQr] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let disposed = false;
    void ticket(person.id)
      .then((url) => QRCode.toDataURL(url, { width: 320, margin: 2 }))
      .then((image) => {
        if (!disposed) setQr(image);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
    };
  }, [person.id, ticket]);
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="bottom" className="mx-auto max-w-md p-6">
        <SheetHeader>
          <SheetTitle>{person.name}</SheetTitle>
        </SheetHeader>
        {qr ? (
          <Image
            unoptimized
            src={qr}
            alt={t("code")}
            width={320}
            height={320}
            className="mx-auto my-4 rounded-xl"
          />
        ) : (
          <p role={failed ? "alert" : "status"}>
            {t(failed ? "error" : "loading")}
          </p>
        )}
        {person.receiptCode && (
          <p className="text-center font-mono tracking-widest">
            {person.receiptCode}
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}
