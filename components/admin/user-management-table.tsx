"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Shield, User, Loader2, CheckCircle, XCircle } from "lucide-react";
import type { Profile, UserRole } from "@/lib/types";
import { ROLE_HIERARCHY } from "@/lib/types";

interface UpdateStatus {
  type: "success" | "error";
  message: string;
  userId: string;
}

interface UserManagementTableProps {
  users: Profile[];
}

const ROLE_OPTIONS: UserRole[] = [
  "admin",
  "moderator",
  "organizer_verified",
  "organizer_pending",
  "contributor",
  "user",
];

const ROLE_COLORS: Record<UserRole, string> = {
  admin: "bg-red-500/10 text-red-600 border-red-500/20",
  moderator: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  organizer_verified: "bg-green-500/10 text-green-600 border-green-500/20",
  organizer_pending: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  contributor: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  user: "bg-gray-500/10 text-gray-600 border-gray-500/20",
};

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  moderator: "Moderator",
  organizer_verified: "Verified Organizer",
  organizer_pending: "Pending Organizer",
  contributor: "Contributor",
  user: "User",
};

const ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: "You must be logged in",
  not_authorized: "You don't have permission to change roles",
  invalid_role: "Invalid role selected",
  cannot_demote_self: "You cannot demote yourself",
  user_not_found: "User not found",
};

export function UserManagementTable({ users }: UserManagementTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  const filteredUsers = users.filter((user) => {
    const searchLower = search.toLowerCase();
    return (
      user.username?.toLowerCase().includes(searchLower) ||
      user.display_name?.toLowerCase().includes(searchLower) ||
      user.id.toLowerCase().includes(searchLower)
    );
  });

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    setUpdating(userId);
    setStatus(null);
    const supabase = createClient();

    const { data, error } = await supabase.rpc("admin_update_user_role", {
      p_user_id: userId,
      p_new_role: newRole,
    });

    if (error) {
      console.error("Failed to update role:", error);
      setStatus({
        type: "error",
        message: "Database error: " + error.message,
        userId,
      });
      setUpdating(null);
      return;
    }

    if (!data?.ok) {
      const errorKey = data?.error || "unknown";
      setStatus({
        type: "error",
        message: ERROR_MESSAGES[errorKey] || `Error: ${errorKey}`,
        userId,
      });
      setUpdating(null);
      router.refresh();
      return;
    }

    setStatus({
      type: "success",
      message: `Role updated to ${ROLE_LABELS[newRole]}`,
      userId,
    });
    setUpdating(null);
    router.refresh();

    // Clear success message after 3 seconds
    setTimeout(() => {
      setStatus((prev) => (prev?.userId === userId ? null : prev));
    }, 3000);
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by username or display name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Stats */}
      <div className="flex gap-4 flex-wrap">
        <Badge variant="outline" className="gap-1">
          <User className="w-3 h-3" />
          {users.length} total users
        </Badge>
        <Badge variant="outline" className={ROLE_COLORS.admin}>
          {users.filter((u) => u.role === "admin").length} admins
        </Badge>
        <Badge variant="outline" className={ROLE_COLORS.organizer_verified}>
          {users.filter((u) => u.role === "organizer_verified").length} verified
        </Badge>
        <Badge variant="outline" className={ROLE_COLORS.organizer_pending}>
          {users.filter((u) => u.role === "organizer_pending").length} pending
        </Badge>
      </div>

      {/* User List */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium text-sm">User</th>
              <th className="text-left p-3 font-medium text-sm">Role</th>
              <th className="text-left p-3 font-medium text-sm hidden sm:table-cell">
                Joined
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredUsers.map((user) => (
              <tr key={user.id} className="hover:bg-muted/30">
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    {user.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <User className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <div className="font-medium">
                        {user.display_name || user.username || "Anonymous"}
                      </div>
                      {user.username && (
                        <div className="text-xs text-muted-foreground">
                          @{user.username}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      {updating === user.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <select
                          value={user.role}
                          onChange={(e) =>
                            handleRoleChange(user.id, e.target.value as UserRole)
                          }
                          className={`text-xs px-2 py-1 rounded-full border font-medium cursor-pointer ${ROLE_COLORS[user.role]}`}
                        >
                          {ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    {status?.userId === user.id && (
                      <div
                        className={`flex items-center gap-1 text-xs ${
                          status.type === "success"
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {status.type === "success" ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        {status.message}
                      </div>
                    )}
                  </div>
                </td>
                <td className="p-3 hidden sm:table-cell">
                  <div className="text-sm text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString()}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredUsers.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No users found matching &quot;{search}&quot;
          </div>
        )}
      </div>
    </div>
  );
}
