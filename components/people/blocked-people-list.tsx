"use client";

import { useState } from "react";
import { useRouter } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { PeopleBlock } from "@/lib/people/types";
import { requestPeople } from "./request";
import { PeopleActionsClient, type PeopleActionCopy } from "./people-actions-client";

export interface BlockedPeopleCopy {
  heading: string;
  scope: string;
  empty: string;
  emptyName: string;
  unblock: string;
  unblocking: string;
  success: string;
  error: string;
}

export function BlockedPeopleList({ initialBlocks, copy, reportCopy }: { initialBlocks: PeopleBlock[]; copy: BlockedPeopleCopy; reportCopy: PeopleActionCopy }) {
  const router = useRouter();
  const [blocks, setBlocks] = useState(initialBlocks);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  async function unblock(userId: string) {
    setBusyId(userId);
    setError(null);
    setStatus(null);
    try {
      await requestPeople("/api/people/block", "DELETE", { user_id: userId });
      setBlocks((previous) => previous.filter((block) => block.blocked_id !== userId));
      setStatus(copy.success);
      router.refresh();
    } catch {
      setError(copy.error);
    } finally {
      setBusyId(null);
    }
  }
  return (
    <section className="space-y-3 border-t border-border pt-8">
      <h2 className="text-lg font-semibold">{copy.heading}</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">{copy.scope}</p>
      {blocks.length === 0 ? <p className="text-sm text-muted-foreground">{copy.empty}</p> : (
        <ul className="divide-y divide-border">
          {blocks.map(({ blocked_id, profile }) => {
            const name = profile.display_name || profile.username || copy.emptyName;
            return <li key={blocked_id} className="py-3"><div className="flex items-center gap-3">
              <UserAvatar src={profile.avatar_url} alt={name} />
              <p className="min-w-0 flex-1 break-words text-sm font-medium">{name}</p>
              <Button type="button" variant="outline" className="min-h-11 shrink-0" disabled={!!busyId} loading={busyId === blocked_id} onClick={() => void unblock(blocked_id)}>{busyId === blocked_id ? copy.unblocking : copy.unblock}</Button>
            </div><PeopleActionsClient userId={blocked_id} copy={reportCopy} reportOnly /></li>;
          })}
        </ul>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {status && <p role="status" className="text-sm">{status}</p>}
    </section>
  );
}
