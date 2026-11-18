"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import Image from "next/image";

/** A clearly labelled sample entry, never a real event or staff credential. */
export function RehearsalQr({ onGuest }: { onGuest: () => void }) {
  const t = useTranslations("eventPractice");
  const [qr, setQr] = useState("");
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(`${location.origin}${location.pathname}?guest=1`, {width:176,margin:2}).then(value=>{if(active)setQr(value);}).catch(()=>{});
    return ()=>{active=false;};
  }, []);
  return <div className="flex items-center gap-4 rounded-lg border p-4">
    {qr && <Image unoptimized src={qr} width={144} height={144} alt={t("sampleQr")} className="h-36 w-36 rounded bg-white" />}
    <div><p className="text-xs text-muted-foreground">{t("sampleQr")}</p><button type="button" className="min-h-11 text-base font-semibold underline underline-offset-4" onClick={onGuest}>{t("checkIn")}</button></div>
  </div>;
}
