"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { UserManagementTable } from "@/components/admin/user-management-table";
import { canUseGodMode } from "@/lib/god-mode";

interface UserAuthData {
  user_id: string;
  last_sign_in_at: string | null;
  login_count: number;
}

export default async function AdminUsersPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Check if user is admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "superadmin")) {
    redirect("/admin");
  }

  // Fetch all users and their auth data in parallel
  const [usersResult, authDataResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.rpc("get_users_with_login_stats"),
  ]);

  const users = usersResult.data || [];
  const authData = (authDataResult.data || []) as UserAuthData[];

  // Create a map of auth data by user_id
  const authDataMap = new Map(
    authData.map((item) => [item.user_id, item])
  );

  // Check if current user can impersonate (super admin only)
  const canImpersonate = await canUseGodMode();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">User Management</h1>
        <p className="text-muted-foreground">
          View and manage all users and their roles
        </p>
      </div>

      <UserManagementTable
        users={users}
        authDataMap={authDataMap}
        canImpersonate={canImpersonate}
        currentUserId={user.id}
      />
    </div>
  );
}
