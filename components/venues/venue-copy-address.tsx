"use client";

import { useCallback } from "react";
import { MapPin } from "lucide-react";
import { toast } from "sonner";

interface VenueCopyAddressProps {
  address: string;
  copiedLabel: string;
}

export function VenueCopyAddress({ address, copiedLabel }: VenueCopyAddressProps) {
  const copyAddress = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = address;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    toast.success(copiedLabel);
  }, [address, copiedLabel]);

  return (
    <button
      type="button"
      onClick={copyAddress}
      className="flex items-center justify-center gap-1 mb-2 cursor-pointer hover:text-foreground active:scale-[0.98] transition-all"
    >
      <MapPin className="w-4 h-4" />
      {address}
    </button>
  );
}
