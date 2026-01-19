"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, MoreVertical, Crown, Shield, UserMinus, Ban, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TransferLeadershipModal } from "./transfer-leadership-modal";
import type { TribeMember, Profile } from "@/lib/types";

interface TribeMembersListProps {
  tribeSlug: string;
  isAdmin: boolean;
}

type MemberWithProfile = TribeMember & { profiles: Profile };

export function TribeMembersList({ tribeSlug, isAdmin }: TribeMembersListProps) {
  const t = useTranslations("tribes");
  const router = useRouter();
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchMembers();
  }, []);

  async function fetchMembers() {
    setLoading(true);
    const res = await fetch(`/api/tribes/${tribeSlug}/members`);
    if (res.ok) {
      const data = await res.json();
      setMembers(data.members || []);
    }
    setLoading(false);
  }

  async function handleRoleChange(userId: string, newRole: "member" | "admin" | "leader") {
    setProcessingId(userId);
    await fetch(`/api/tribes/${tribeSlug}/members`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, role: newRole }),
    });
    await fetchMembers();
    setProcessingId(null);
    router.refresh();
  }

  async function handleBan(userId: string) {
    setProcessingId(userId);
    await fetch(`/api/tribes/${tribeSlug}/members`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, status: "banned" }),
    });
    await fetchMembers();
    setProcessingId(null);
    router.refresh();
  }

  async function handleRemove(userId: string) {
    setProcessingId(userId);
    await fetch(`/api/tribes/${tribeSlug}/members?user_id=${userId}`, { method: "DELETE" });
    await fetchMembers();
    setProcessingId(null);
    router.refresh();
  }

  const roleIcon = {
    leader: <Crown className="w-3 h-3 text-yellow-500" />,
    admin: <Shield className="w-3 h-3 text-blue-500" />,
    member: null,
  };

  const roleBadgeVariant = {
    leader: "default" as const,
    admin: "secondary" as const,
    member: "outline" as const,
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (members.length === 0) {
    return <p className="text-center py-8 text-muted-foreground">{t("noMembers")}</p>;
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.map((member) => (
          <div key={member.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <Avatar className="w-10 h-10">
              <AvatarImage src={member.profiles.avatar_url || undefined} />
              <AvatarFallback>{member.profiles.display_name?.charAt(0) || "?"}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">
                {member.profiles.display_name || member.profiles.username || "Unknown"}
              </p>
              <div className="flex items-center gap-1">
                {roleIcon[member.role]}
                <Badge variant={roleBadgeVariant[member.role]} className="text-xs">
                  {t(member.role)}
                </Badge>
              </div>
            </div>
            {isAdmin && member.role !== "leader" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={processingId === member.user_id}
                    className="h-10 w-10"
                  >
                    {processingId === member.user_id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <MoreVertical className="w-4 h-4" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {member.role === "member" && (
                    <DropdownMenuItem onClick={() => handleRoleChange(member.user_id, "admin")}>
                      <Shield className="w-4 h-4 mr-2" />
                      Promote to Admin
                    </DropdownMenuItem>
                  )}
                  {member.role === "admin" && (
                    <DropdownMenuItem onClick={() => handleRoleChange(member.user_id, "member")}>
                      <UserCheck className="w-4 h-4 mr-2" />
                      Demote to Member
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => handleBan(member.user_id)} className="text-orange-600">
                    <Ban className="w-4 h-4 mr-2" />
                    {t("banMember")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleRemove(member.user_id)} className="text-destructive">
                    <UserMinus className="w-4 h-4 mr-2" />
                    {t("removeMember")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ))}
      </div>

      {isAdmin && (
        <div className="mt-4">
          <Button
            variant="outline"
            onClick={() => setShowTransferModal(true)}
            className="px-3 py-2"
          >
            <Crown className="w-4 h-4 mr-2" />
            {t("transferLeadership")}
          </Button>
        </div>
      )}

      <TransferLeadershipModal
        tribeSlug={tribeSlug}
        members={members.filter((m) => m.role !== "leader")}
        open={showTransferModal}
        onOpenChange={setShowTransferModal}
      />
    </>
  );
}
