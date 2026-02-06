"use client";

import { useState } from "react";
import { Download } from "lucide-react";

interface DownloadButtonProps {
  fileUrl: string;
  filename: string;
  locale: string;
}

export function DownloadButton({ fileUrl, filename, locale }: DownloadButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (isDownloading) return;

    setIsDownloading(true);
    try {
      // Fetch as blob to ensure download works cross-origin
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      // Trigger download
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={isDownloading}
      className="w-full flex items-center justify-center gap-3 py-4 px-6 bg-primary text-primary-foreground rounded-xl font-semibold text-lg hover:bg-primary/90 transition-colors disabled:opacity-70"
    >
      {isDownloading ? (
        <>
          <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
          <span>{locale === "vi" ? "Đang tải..." : "Downloading..."}</span>
        </>
      ) : (
        <>
          <Download className="w-6 h-6" />
          <span>{locale === "vi" ? "Tải MP3 Miễn Phí" : "Download MP3 Free"}</span>
        </>
      )}
    </button>
  );
}
