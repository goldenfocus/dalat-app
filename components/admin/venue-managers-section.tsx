"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Crown,
  Pencil,
  Eye,
  Search,
  UserPlus,
  X,
  ChevronDown,
  Loader2,
  Check,
  Trash2,
  Sparkles,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type ManagerRole = "owner" | "editor" | "viewer";

interface Manager {
  id: string;
  profile_id: string;
  role: ManagerRole;
  profile: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

interface SearchUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface VenueManagersSectionProps {
  venueId: string;
  venueName: string;
}

const ROLE_CONFIG: Record<
  ManagerRole,
  { label: string; icon: typeof Crown; color: string; bgColor: string; description: string }
> = {
  owner: {
    label: "Owner",
    icon: Crown,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-500/10 border-amber-500/30",
    description: "Full control, can add/remove managers",
  },
  editor: {
    label: "Editor",
    icon: Pencil,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-500/10 border-blue-500/30",
    description: "Can edit venue details and events",
  },
  viewer: {
    label: "Viewer",
    icon: Eye,
    color: "text-slate-600 dark:text-slate-400",
    bgColor: "bg-slate-500/10 border-slate-500/30",
    description: "View-only access to analytics",
  },
};

export function VenueManagersSection({
  venueId,
  venueName,
}: VenueManagersSectionProps) {
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedRole, setSelectedRole] = useState<ManagerRole>("editor");
  const [adding, setAdding] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch current managers
  const fetchManagers = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("venue_managers")
      .select(
        `
        id,
        profile_id,
        role,
        profile:profiles!venue_managers_profile_id_fkey (
          username,
          display_name,
          avatar_url
        )
      `
      )
      .eq("venue_id", venueId)
      .order("role");

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transformedData = data.map((item: any) => ({
        ...item,
        profile: Array.isArray(item.profile) ? item.profile[0] : item.profile,
      })) as Manager[];
      setManagers(transformedData);
    }
    setLoading(false);
  }, [venueId]);

  useEffect(() => {
    fetchManagers();
  }, [fetchManagers]);

  // Search users with debounce
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(searchQuery)}`
        );
        const data = await res.json();
        // Filter out users who are already managers
        const existingIds = new Set(managers.map((m) => m.profile_id));
        setSearchResults(
          (data.users || []).filter((u: SearchUser) => !existingIds.has(u.id))
        );
        setShowDropdown(true);
      } catch {
        setSearchResults([]);
      }
      setSearching(false);
    }, 300);

    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [searchQuery, managers]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Show success message with auto-dismiss
  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  // Add manager
  async function handleAddManager(user: SearchUser) {
    setAdding(user.id);
    const supabase = createClient();

    const { error } = await supabase.from("venue_managers").insert({
      venue_id: venueId,
      profile_id: user.id,
      role: selectedRole,
      accepted_at: new Date().toISOString(),
    });

    if (!error) {
      await fetchManagers();
      setSearchQuery("");
      setShowDropdown(false);
      showSuccess(`Added ${user.display_name || user.username} as ${ROLE_CONFIG[selectedRole].label}`);
    }
    setAdding(null);
  }

  // Change role
  async function handleChangeRole(managerId: string, newRole: ManagerRole) {
    setChangingRole(managerId);
    const supabase = createClient();

    const manager = managers.find((m) => m.id === managerId);
    await supabase
      .from("venue_managers")
      .update({ role: newRole })
      .eq("id", managerId);

    await fetchManagers();
    setChangingRole(null);
    if (manager) {
      showSuccess(`Changed ${manager.profile.display_name || manager.profile.username} to ${ROLE_CONFIG[newRole].label}`);
    }
  }

  // Remove manager
  async function handleRemoveManager(managerId: string) {
    setRemoving(managerId);
    const supabase = createClient();
    const manager = managers.find((m) => m.id === managerId);

    await supabase.from("venue_managers").delete().eq("id", managerId);

    await fetchManagers();
    setRemoving(null);
    setConfirmRemove(null);
    if (manager) {
      showSuccess(`Removed ${manager.profile.display_name || manager.profile.username}`);
    }
  }

  const getInitials = (name: string | null, username: string) => {
    if (name) {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return username.slice(0, 2).toUpperCase();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading managers...</span>
        </div>
      </div>
    );
  }

  const owners = managers.filter((m) => m.role === "owner");
  const editors = managers.filter((m) => m.role === "editor");
  const viewers = managers.filter((m) => m.role === "viewer");

  return (
    <div className="space-y-6">
      {/* Success Toast */}
      {successMessage && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-sm animate-in slide-in-from-top-2 duration-200">
          <Check className="w-4 h-4 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Current Managers */}
      <div className="space-y-4">
        {managers.length === 0 ? (
          <div className="text-center py-10 px-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-muted/50 mb-4">
              <UserPlus className="w-7 h-7 text-muted-foreground" />
            </div>
            <h3 className="font-medium text-foreground mb-1">No managers yet</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              Add managers to give people access to edit {venueName}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Owners Section */}
            {owners.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                  <Crown className="w-3 h-3" />
                  <span>Owners</span>
                </div>
                {owners.map((manager) => (
                  <ManagerCard
                    key={manager.id}
                    manager={manager}
                    onChangeRole={handleChangeRole}
                    onRemove={() => setConfirmRemove(manager.id)}
                    isChangingRole={changingRole === manager.id}
                    isRemoving={removing === manager.id}
                    confirmingRemove={confirmRemove === manager.id}
                    onCancelRemove={() => setConfirmRemove(null)}
                    onConfirmRemove={() => handleRemoveManager(manager.id)}
                    getInitials={getInitials}
                  />
                ))}
              </div>
            )}

            {/* Editors Section */}
            {editors.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                  <Pencil className="w-3 h-3" />
                  <span>Editors</span>
                </div>
                {editors.map((manager) => (
                  <ManagerCard
                    key={manager.id}
                    manager={manager}
                    onChangeRole={handleChangeRole}
                    onRemove={() => setConfirmRemove(manager.id)}
                    isChangingRole={changingRole === manager.id}
                    isRemoving={removing === manager.id}
                    confirmingRemove={confirmRemove === manager.id}
                    onCancelRemove={() => setConfirmRemove(null)}
                    onConfirmRemove={() => handleRemoveManager(manager.id)}
                    getInitials={getInitials}
                  />
                ))}
              </div>
            )}

            {/* Viewers Section */}
            {viewers.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                  <Eye className="w-3 h-3" />
                  <span>Viewers</span>
                </div>
                {viewers.map((manager) => (
                  <ManagerCard
                    key={manager.id}
                    manager={manager}
                    onChangeRole={handleChangeRole}
                    onRemove={() => setConfirmRemove(manager.id)}
                    isChangingRole={changingRole === manager.id}
                    isRemoving={removing === manager.id}
                    confirmingRemove={confirmRemove === manager.id}
                    onCancelRemove={() => setConfirmRemove(null)}
                    onConfirmRemove={() => handleRemoveManager(manager.id)}
                    getInitials={getInitials}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Manager Section */}
      <div className="pt-5 border-t border-dashed border-border/60">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10">
            <UserPlus className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-medium">Add a Manager</h3>
            <p className="text-xs text-muted-foreground">Search by username or name</p>
          </div>
        </div>

        <div className="flex gap-2">
          {/* Role selector */}
          <div className="relative">
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as ManagerRole)}
              className="h-11 pl-3 pr-8 rounded-xl border border-input bg-background text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-shadow"
            >
              {(Object.keys(ROLE_CONFIG) as ManagerRole[]).map((role) => (
                <option key={role} value={role}>
                  {ROLE_CONFIG[role].label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>

          {/* User search */}
          <div ref={searchRef} className="relative flex-1">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type to search users..."
                className="w-full h-11 pl-10 pr-4 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-shadow"
              />
              {searching && (
                <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Search dropdown */}
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-popover border border-border rounded-xl shadow-xl overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200">
                <div className="max-h-64 overflow-y-auto py-1">
                  {searchResults.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => handleAddManager(user)}
                      disabled={adding === user.id}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/60 active:bg-muted transition-colors disabled:opacity-50"
                    >
                      <Avatar className="h-9 w-9 ring-2 ring-background">
                        <AvatarImage src={user.avatar_url ?? undefined} />
                        <AvatarFallback className="text-xs font-medium">
                          {getInitials(user.display_name, user.username)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 text-left min-w-0">
                        <div className="text-sm font-medium truncate">
                          {user.display_name || user.username}
                        </div>
                        {user.display_name && (
                          <div className="text-xs text-muted-foreground truncate">
                            @{user.username}
                          </div>
                        )}
                      </div>
                      {adding === user.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      ) : (
                        <span className={cn(
                          "flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border",
                          ROLE_CONFIG[selectedRole].bgColor,
                          ROLE_CONFIG[selectedRole].color
                        )}>
                          <Sparkles className="w-3 h-3" />
                          Add as {ROLE_CONFIG[selectedRole].label}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showDropdown && searchQuery.length >= 2 && searchResults.length === 0 && !searching && (
              <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-popover border border-border rounded-xl shadow-xl p-6 text-center animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-muted/50 mb-2">
                  <Search className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  No users found for &ldquo;{searchQuery}&rdquo;
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Role descriptions */}
        <div className="mt-4 grid gap-2">
          {(Object.entries(ROLE_CONFIG) as [ManagerRole, typeof ROLE_CONFIG.owner][]).map(
            ([role, config]) => {
              const Icon = config.icon;
              const isSelected = selectedRole === role;
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => setSelectedRole(role)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all",
                    isSelected
                      ? cn(config.bgColor, "ring-1 ring-offset-1 ring-offset-background", role === "owner" ? "ring-amber-500/50" : role === "editor" ? "ring-blue-500/50" : "ring-slate-500/50")
                      : "border-transparent hover:bg-muted/50"
                  )}
                >
                  <div className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-lg",
                    isSelected ? config.bgColor : "bg-muted/50"
                  )}>
                    <Icon className={cn("w-4 h-4", isSelected ? config.color : "text-muted-foreground")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={cn(
                      "text-sm font-medium",
                      isSelected ? config.color : "text-foreground"
                    )}>
                      {config.label}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {config.description}
                    </div>
                  </div>
                  {isSelected && (
                    <Check className={cn("w-4 h-4", config.color)} />
                  )}
                </button>
              );
            }
          )}
        </div>
      </div>
    </div>
  );
}

// Manager Card Component
interface ManagerCardProps {
  manager: Manager;
  onChangeRole: (managerId: string, role: ManagerRole) => void;
  onRemove: () => void;
  isChangingRole: boolean;
  isRemoving: boolean;
  confirmingRemove: boolean;
  onCancelRemove: () => void;
  onConfirmRemove: () => void;
  getInitials: (name: string | null, username: string) => string;
}

function ManagerCard({
  manager,
  onChangeRole,
  onRemove,
  isChangingRole,
  isRemoving,
  confirmingRemove,
  onCancelRemove,
  onConfirmRemove,
  getInitials,
}: ManagerCardProps) {
  const config = ROLE_CONFIG[manager.role];
  const Icon = config.icon;

  if (confirmingRemove) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl border-2 border-red-500/30 bg-red-500/5 animate-in fade-in-0 zoom-in-98 duration-200">
        <Avatar className="h-10 w-10 ring-2 ring-red-500/20">
          <AvatarImage src={manager.profile.avatar_url ?? undefined} />
          <AvatarFallback className="text-sm">
            {getInitials(manager.profile.display_name, manager.profile.username)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-700 dark:text-red-300">
            Remove {manager.profile.display_name || manager.profile.username}?
          </p>
          <p className="text-xs text-muted-foreground">
            They&apos;ll lose access to this venue
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onCancelRemove}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirmRemove}
            disabled={isRemoving}
            className="px-3 py-2 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {isRemoving ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Trash2 className="w-3 h-3" />
            )}
            Remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-card hover:border-border hover:shadow-sm transition-all group">
      <Avatar className="h-10 w-10 ring-2 ring-background shadow-sm">
        <AvatarImage src={manager.profile.avatar_url ?? undefined} />
        <AvatarFallback className="text-sm font-medium">
          {getInitials(manager.profile.display_name, manager.profile.username)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">
            {manager.profile.display_name || manager.profile.username}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border",
              config.bgColor,
              config.color
            )}
          >
            <Icon className="w-3 h-3" />
            {config.label}
          </span>
        </div>
        {manager.profile.display_name && (
          <p className="text-xs text-muted-foreground truncate">
            @{manager.profile.username}
          </p>
        )}
      </div>

      {/* Actions - visible on hover */}
      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex-shrink-0">
        <div className="relative">
          <select
            value={manager.role}
            onChange={(e) => onChangeRole(manager.id, e.target.value as ManagerRole)}
            disabled={isChangingRole}
            className="h-8 pl-2 pr-6 text-xs rounded-lg border border-input bg-background appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 transition-shadow"
          >
            {(Object.keys(ROLE_CONFIG) as ManagerRole[]).map((role) => (
              <option key={role} value={role}>
                {ROLE_CONFIG[role].label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
        </div>

        <button
          type="button"
          onClick={onRemove}
          className="p-2 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-500/10 transition-colors"
          title="Remove manager"
        >
          {isRemoving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <X className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}
