"use client";

import { useEffect, useState, useTransition as _useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { TribeRequest, Profile } from "@/lib/types";

interface TribeRequestsModalProps {
  tribeSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type RequestWithProfile = TribeRequest & { profiles: Profile };

export function TribeRequestsModal({ tribeSlug, open, onOpenChange }: TribeRequestsModalProps) {
  const t = useTranslations("tribes");
  const router = useRouter();
  const [requests, setRequests] = useState<RequestWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      fetchRequests();
    }
  }, [open]);

  async function fetchRequests() {
    setLoading(true);
    const res = await fetch(`/api/tribes/${tribeSlug}/requests`);
    if (res.ok) {
      const data = await res.json();
      setRequests(data.requests || []);
    }
    setLoading(false);
  }

  async function handleAction(requestId: string, action: "approve" | "reject") {
    setProcessingIds((prev) => new Set(prev).add(requestId));

    const res = await fetch(`/api/tribes/${tribeSlug}/requests`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_id: requestId, action }),
    });

    if (res.ok) {
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      router.refresh();
    }

    setProcessingIds((prev) => {
      const next = new Set(prev);
      next.delete(requestId);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("joinRequests")}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : requests.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">{t("noRequests")}</p>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {requests.map((request) => (
              <div key={request.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={request.profiles.avatar_url || undefined} />
                  <AvatarFallback>{request.profiles.display_name?.charAt(0) || "?"}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {request.profiles.display_name || request.profiles.username || "Unknown"}
                  </p>
                  {request.message && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{request.message}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(request.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleAction(request.id, "approve")}
                    disabled={processingIds.has(request.id)}
                    className="text-green-600 hover:text-green-700 hover:bg-green-50 p-2"
                  >
                    {processingIds.has(request.id) ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleAction(request.id, "reject")}
                    disabled={processingIds.has(request.id)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 p-2"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
