"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { HostAction, HostStaff } from "./host-types";

export function HostTeam({ staff, busy, act }: { staff: HostStaff[]; busy: boolean; act: HostAction }) {
  const t = useTranslations("arrival");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<HostStaff["role"]>("welcome");
  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (await act({ action: "addStaff", username: username.trim().replace(/^@/, "").trim(), role })) setUsername("");
  };
  return <section className="space-y-6">
    <div><h2 className="text-xl font-semibold">{t("hostTeam")}</h2><p className="mt-2 text-sm text-muted-foreground">{t("hostTeamHint")}</p></div>
    <form onSubmit={add} className="space-y-4 rounded-lg border p-4">
      <label className="block text-sm font-medium" htmlFor="staff-username">{t("hostUsername")}</label>
      <input id="staff-username" required autoCapitalize="none" autoCorrect="off" maxLength={80} value={username} onChange={event => setUsername(event.target.value)} placeholder={t("hostUsernamePlaceholder")} className="min-h-12 w-full rounded-lg border bg-background px-3" />
      <label htmlFor="staff-role" className="block text-sm font-medium">{t("hostRole")}</label>
      <select id="staff-role" value={role} onChange={event => setRole(event.target.value as HostStaff["role"])} className="min-h-12 w-full rounded-lg border bg-background px-3">
        <option value="welcome">{t("hostRoleWelcome")}</option><option value="orders">{t("hostRoleOrders")}</option><option value="manager">{t("hostRoleManager")}</option>
      </select>
      <p className="text-xs text-muted-foreground">{t(role === "welcome" ? "hostRoleWelcomeHint" : role === "orders" ? "hostRoleOrdersHint" : "hostRoleManagerHint")}</p>
      <button disabled={busy || !username.trim()} className="min-h-12 w-full rounded-lg bg-primary px-4 font-medium text-primary-foreground disabled:opacity-50">{t("hostAddStaff")}</button>
    </form>
    <ul className="divide-y border-y">{staff.map(person => <li key={person.user_id} className="flex items-center justify-between gap-3 py-4">
      <div className="min-w-0"><p className="truncate font-medium">{person.displayName || person.username || t("hostGuest")}</p>{person.username && <p className="truncate text-sm text-muted-foreground">@{person.username}</p>}<p className="text-sm text-muted-foreground">{t(person.role === "welcome" ? "hostRoleWelcome" : person.role === "orders" ? "hostRoleOrders" : "hostRoleManager")}</p></div>
      <button type="button" disabled={busy} onClick={() => { if (window.confirm(t("hostRemoveConfirm", { name: person.displayName || person.username || t("hostGuest") }))) void act({ action: "removeStaff", userId: person.user_id }); }} className="min-h-11 shrink-0 px-3 text-sm text-destructive disabled:opacity-50">{t("hostRemoveStaff")}</button>
    </li>)}</ul>
  </section>;
}
