"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy } from "lucide-react";

export function CopyRentalAddress({ address, openGrab }: { address: string; openGrab: boolean }) {
  const [status, setStatus] = useState("");
  const t = useTranslations("rentalsPilot");
  const style = "inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm";
  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setStatus(t(openGrab ? "pasteInGrab" : "addressCopied"));
    } catch {
      setStatus(t("copyAddressFailed"));
    }
  }
  return <>
    <button type="button" onClick={copy} className={style} aria-label={t("copyAddress")} title={t("copyAddress")}>
      <Copy className="size-4" aria-hidden="true" />
    </button>
    {openGrab && <a href="https://www.grab.com/vn/transport/" target="_blank" rel="noreferrer" onClick={copy} className={style}>Grab</a>}
    <span role="status" className={status ? "basis-full text-sm text-muted-foreground" : "sr-only"}>{status}</span>
  </>;
}
