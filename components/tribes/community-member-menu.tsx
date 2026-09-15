"use client";

import { useState } from "react";
import { useRouter } from "@/lib/i18n/routing";
import { Link } from "@/lib/i18n/routing";
import { useTranslations } from "next-intl";
import { Bell, BellOff, ChartNoAxesCombined, LogOut, Settings, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import type { Tribe, TribeMember } from "@/lib/types";

interface Props {
  tribe: Tribe;
  membership: TribeMember | null;
  isAdmin: boolean;
  canViewInsights: boolean;
  notificationsMuted: boolean;
  onEdit: () => void;
}

export function CommunityMemberMenu({ tribe, membership, isAdmin, canViewInsights, notificationsMuted, onEdit }: Props) {
  const t = useTranslations("tribes");
  const router = useRouter();
  const [muted, setMuted] = useState(notificationsMuted);
  const [busy, setBusy] = useState(false);
  const [showLeave, setShowLeave] = useState(false);
  const [left, setLeft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMember = membership?.status === "active" && !left;
  const isOwner = membership?.user_id === tribe.created_by;

  if (!isMember && !isAdmin && !canViewInsights) return null;

  async function toggleMute() {
    setBusy(true);
    try {
      const res = await fetch(`/api/tribes/${tribe.slug}/notifications`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ muted: !muted }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMuted(data.muted);
      toast.success(t(data.muted ? "memberMenu.muted" : "memberMenu.unmuted"));
      router.refresh();
    } catch { toast.error(t("memberMenu.failed")); }
    finally { setBusy(false); }
  }

  async function leave() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tribes/${tribe.slug}/membership`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(t(data.code === "transfer_required" ? "memberMenu.transferFirst" : "memberMenu.failed"));
        return;
      }
      setLeft(true);
      setShowLeave(false);
      toast.success(t("memberMenu.left"));
      router.replace("/communities");
      router.refresh();
    } catch { setError(t("memberMenu.failed")); }
    finally { setBusy(false); }
  }

  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground" aria-label={t("settings")} disabled={busy}>
          <Settings className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isMember && <DropdownMenuItem onSelect={toggleMute} disabled={busy}>
          {muted ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          {t(muted ? "memberMenu.unmute" : "memberMenu.mute")}
        </DropdownMenuItem>}
        {isAdmin && <DropdownMenuItem onSelect={onEdit}><Settings className="w-4 h-4" />{t("memberMenu.edit")}</DropdownMenuItem>}
        {isAdmin && <DropdownMenuItem asChild><a href="#members"><Users className="w-4 h-4" />{t("memberMenu.manage")}</a></DropdownMenuItem>}
        {canViewInsights && <DropdownMenuItem asChild><Link href={`/communities/${tribe.slug}/insights`}><ChartNoAxesCombined className="w-4 h-4" />{t("insights")}</Link></DropdownMenuItem>}
        {isMember && <>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => { setError(null); setShowLeave(true); }}>
            <LogOut className="w-4 h-4" />{t("leaveTribe")}
          </DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={showLeave} onOpenChange={(open) => { if (!busy) setShowLeave(open); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("leaveTribe")}</DialogTitle>
          <DialogDescription>{t(isOwner ? "memberMenu.transferFirst" : "memberMenu.leaveDescription")}</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setShowLeave(false)}>{t("cancel")}</Button>
          {isOwner ? <Button asChild><a href="#members" onClick={() => setShowLeave(false)}>{t("transferLeadership")}</a></Button>
            : <Button variant="destructive" disabled={busy} onClick={leave}>{t("leaveTribe")}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
