"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import type { TribeMember, Profile } from "@/lib/types";

interface TransferLeadershipModalProps {
  tribeSlug: string;
  members: (TribeMember & { profiles: Profile })[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TransferLeadershipModal({ tribeSlug, members, open, onOpenChange }: TransferLeadershipModalProps) {
  const router = useRouter();
  const t = useTranslations("tribes");
  const [isPending, startTransition] = useTransition();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleTransfer() {
    if (!selectedUserId) return;

    setError(null);

    startTransition(async () => {
      const res = await fetch(`/api/tribes/${tribeSlug}/ownership`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: selectedUserId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to transfer leadership");
        return;
      }

      router.refresh();
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-yellow-500" />
            {t("transferLeadership")}
          </DialogTitle>
          <DialogDescription>
            {t("transferLeadershipDesc")}
          </DialogDescription>
        </DialogHeader>

        {members.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">
            No members available to transfer leadership to.
          </p>
        ) : (
          <RadioGroup value={selectedUserId || ""} onValueChange={setSelectedUserId}>
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {members.map((member) => (
                <div
                  key={member.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedUserId === member.user_id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                  onClick={() => setSelectedUserId(member.user_id)}
                >
                  <RadioGroupItem value={member.user_id} id={member.user_id} />
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={member.profiles.avatar_url || undefined} />
                    <AvatarFallback>{member.profiles.display_name?.charAt(0) || "?"}</AvatarFallback>
                  </Avatar>
                  <Label htmlFor={member.user_id} className="flex-1 cursor-pointer">
                    {member.profiles.display_name || member.profiles.username || "Unknown"}
                  </Label>
                </div>
              ))}
            </div>
          </RadioGroup>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="px-3 py-2">
            Cancel
          </Button>
          <Button
            onClick={handleTransfer}
            disabled={!selectedUserId || isPending || members.length === 0}
            className="px-3 py-2"
          >
            {isPending ? "Transferring..." : "Transfer Leadership"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
