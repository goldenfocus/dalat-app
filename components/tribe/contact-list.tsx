"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Mail,
  Phone,
  Trash2,
  MoreVertical,
  Send,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface Contact {
  id: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  notes?: string | null;
  status: "active" | "unsubscribed" | "bounced";
  created_at: string;
}

interface ContactListProps {
  contacts: Contact[];
  onDelete: (id: string) => Promise<void>;
  onInvite?: (contactIds: string[]) => void;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
}

export function ContactList({
  contacts,
  onDelete,
  onInvite,
  selectedIds = [],
  onSelectionChange,
}: ContactListProps) {
  const t = useTranslations("contacts");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await onDelete(deleteId);
    } finally {
      setIsDeleting(false);
      setDeleteId(null);
    }
  };

  const toggleSelection = (id: string) => {
    if (!onSelectionChange) return;
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((i) => i !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const toggleSelectAll = () => {
    if (!onSelectionChange) return;
    const activeIds = contacts
      .filter((c) => c.status === "active")
      .map((c) => c.id);
    if (selectedIds.length === activeIds.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(activeIds);
    }
  };

  if (contacts.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Mail className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p className="font-medium">{t("noContacts")}</p>
        <p className="text-sm">{t("addContacts")}</p>
      </div>
    );
  }

  const activeContacts = contacts.filter((c) => c.status === "active");

  return (
    <div className="space-y-4">
      {/* Selection header */}
      {onSelectionChange && (
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={
                selectedIds.length > 0 &&
                selectedIds.length === activeContacts.length
              }
              onChange={toggleSelectAll}
              className="rounded"
            />
            <span>
              {selectedIds.length > 0
                ? `${selectedIds.length} selected`
                : `Select all (${activeContacts.length})`}
            </span>
          </label>

          {selectedIds.length > 0 && onInvite && (
            <Button size="sm" onClick={() => onInvite(selectedIds)}>
              <Send className="w-4 h-4 mr-1" />
              {t("inviteToEvent")}
            </Button>
          )}
        </div>
      )}

      {/* Contact list */}
      <div className="border rounded-lg divide-y">
        {contacts.map((contact) => (
          <div
            key={contact.id}
            className={cn(
              "flex items-center gap-3 p-3",
              contact.status !== "active" && "opacity-60"
            )}
          >
            {onSelectionChange && (
              <input
                type="checkbox"
                checked={selectedIds.includes(contact.id)}
                onChange={() => toggleSelection(contact.id)}
                disabled={contact.status !== "active"}
                className="rounded"
              />
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">
                  {contact.name || contact.email}
                </span>
                {contact.status !== "active" && (
                  <span
                    className={cn(
                      "text-xs px-1.5 py-0.5 rounded",
                      contact.status === "bounced"
                        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                    )}
                  >
                    {t(`status.${contact.status}`)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1 truncate">
                  <Mail className="w-3 h-3" />
                  {contact.email}
                </span>
                {contact.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {contact.phone}
                  </span>
                )}
              </div>
              {contact.notes && (
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {contact.notes}
                </p>
              )}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setDeleteId(contact.id)}
                  className="text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t("deleteContact")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {contacts.find((c) => c.id === deleteId)?.email}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "..." : t("deleteContact")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface InviteStatusProps {
  total: number;
  sent: number;
  failed: number;
}

export function InviteStatus({ total, sent, failed }: InviteStatusProps) {
  const t = useTranslations("contacts");

  if (sent === 0 && failed === 0) return null;

  const allSent = sent === total && failed === 0;

  return (
    <div
      className={cn(
        "flex items-center gap-2 p-3 rounded-lg",
        allSent
          ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
          : "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400"
      )}
    >
      {allSent ? (
        <CheckCircle className="w-4 h-4" />
      ) : (
        <AlertCircle className="w-4 h-4" />
      )}
      <span>
        {allSent ? t("invitesSent") : `${sent} sent, ${failed} failed`}
      </span>
    </div>
  );
}
