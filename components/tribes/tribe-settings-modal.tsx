"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Copy, ImagePlus, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { uploadFile } from "@/lib/storage/client";
import { finalizeSlug, sanitizeSlug } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DeleteTribeModal } from "./delete-tribe-modal";
import type { Tribe, TribeAccessType } from "@/lib/types";

interface TribeSettingsModalProps {
  tribe: Tribe;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TribeSettingsModal({ tribe, open, onOpenChange }: TribeSettingsModalProps) {
  const router = useRouter();
  const t = useTranslations("tribes");
  const [isPending, startTransition] = useTransition();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const [name, setName] = useState(tribe.name);
  // Deliberately not derived from `name` — renaming a live tribe shouldn't silently
  // break every link already shared to it. Changing the URL stays an explicit act.
  const [slug, setSlug] = useState(tribe.slug);
  const [description, setDescription] = useState(tribe.description || "");
  const [accessType, setAccessType] = useState<TribeAccessType>(tribe.access_type);
  const [isListed, setIsListed] = useState(tribe.is_listed);
  const [inviteCode, setInviteCode] = useState(tribe.invite_code);
  const [error, setError] = useState<string | null>(null);

  const [coverUrl, setCoverUrl] = useState<string | null>(tribe.cover_image_url);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(tribe.settings?.avatar_url ?? null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  async function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    const preview = URL.createObjectURL(file);
    setAvatarPreview(preview);
    setIsUploadingAvatar(true);
    try {
      const { publicUrl } = await uploadFile("event-media", file, {
        entityId: `tribe-${tribe.id}`,
      });
      setAvatarUrl(publicUrl);
    } catch (err) {
      console.error("Tribe avatar upload error:", err);
      URL.revokeObjectURL(preview);
      setAvatarPreview(null);
      // Aborted uploads aren't failures — revert the preview silently
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(t("avatarUploadFailed"));
      }
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  function handleRemoveAvatar() {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(null);
    setAvatarUrl(null);
  }

  async function handleCoverSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    const preview = URL.createObjectURL(file);
    setCoverPreview(preview);
    setIsUploadingCover(true);
    try {
      const { publicUrl } = await uploadFile("event-media", file, {
        entityId: `tribe-${tribe.id}`,
      });
      setCoverUrl(publicUrl);
    } catch {
      URL.revokeObjectURL(preview);
      setCoverPreview(null);
      setError(t("coverUploadFailed"));
    } finally {
      setIsUploadingCover(false);
    }
  }

  function handleRemoveCover() {
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverPreview(null);
    setCoverUrl(null);
  }

  async function handleSave() {
    setError(null);
    const nextSlug = finalizeSlug(slug);
    setSlug(nextSlug);

    startTransition(async () => {
      const res = await fetch(`/api/tribes/${tribe.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: nextSlug,
          description: description.trim() || null,
          access_type: accessType,
          is_listed: isListed,
          cover_image_url: coverUrl,
          avatar_url: avatarUrl,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.code ? t(`settingsForm.${data.code}`) : t("settingsForm.saveFailed"));
        return;
      }

      onOpenChange(false);

      // The URL moved — the current page no longer resolves, so navigate before refreshing
      if (data.tribe?.slug && data.tribe.slug !== tribe.slug) {
        router.replace(window.location.pathname.replace(/[^/]+$/, data.tribe.slug));
        return;
      }

      router.refresh();
    });
  }

  async function handleRegenerateCode() {
    startTransition(async () => {
      const res = await fetch(`/api/tribes/${tribe.slug}/invite-code`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setInviteCode(data.invite_code);
      }
    });
  }

  function handleCopyCode() {
    if (inviteCode) {
      navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const inviteUrl = inviteCode ? `${window.location.origin}/tribes/join/${inviteCode}` : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("settings")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("avatar")}</Label>
              <div className="flex items-center gap-3">
                <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-primary/10 shrink-0">
                  {avatarPreview || avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarPreview || avatarUrl || undefined}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-primary">
                      {name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {isUploadingAvatar && (
                    <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={isUploadingAvatar}
                    className="px-3 py-2 active:scale-95 transition-all"
                  >
                    <ImagePlus className="w-4 h-4 mr-2" />
                    {avatarPreview || avatarUrl ? t("replaceAvatar") : t("uploadAvatar")}
                  </Button>
                  {(avatarPreview || avatarUrl) && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handleRemoveAvatar}
                      disabled={isUploadingAvatar}
                      className="px-3 py-2 active:scale-95 transition-all text-muted-foreground"
                    >
                      <X className="w-4 h-4 mr-2" />
                      {t("removeAvatar")}
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t("avatarHint")}</p>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleAvatarSelect}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("coverImage")}</Label>
              <div className="relative h-32 rounded-lg overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5">
                {coverPreview || coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={coverPreview || coverUrl || undefined}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-primary">
                    {name.charAt(0).toUpperCase()}
                  </div>
                )}
                {isUploadingCover && (
                  <div className="absolute inset-0 bg-background/60 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">{t("coverUploading")}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={isUploadingCover}
                  className="px-3 py-2 active:scale-95 transition-all"
                >
                  <ImagePlus className="w-4 h-4 mr-2" />
                  {coverPreview || coverUrl ? t("replaceCover") : t("uploadCover")}
                </Button>
                {(coverPreview || coverUrl) && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleRemoveCover}
                    disabled={isUploadingCover}
                    className="px-3 py-2 active:scale-95 transition-all text-muted-foreground"
                  >
                    <X className="w-4 h-4 mr-2" />
                    {t("removeCover")}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t("coverImageHint")}</p>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleCoverSelect}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tribe-name">{t("settingsForm.name")}</Label>
              <Input
                id="tribe-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tribe-slug">{t("settingsForm.url")}</Label>
              <div className="flex items-center">
                <span className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded-l-md border border-r-0 border-input whitespace-nowrap">
                  dalat.app/tribes/
                </span>
                <Input
                  id="tribe-slug"
                  value={slug}
                  onChange={(e) => setSlug(sanitizeSlug(e.target.value))}
                  onBlur={() => setSlug(finalizeSlug(slug))}
                  maxLength={60}
                  className="rounded-l-none"
                />
              </div>
              {slug !== tribe.slug && (
                <p className="text-xs text-muted-foreground">{t("settingsForm.urlHint")}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="tribe-description">{t("settingsForm.description")}</Label>
              <Textarea
                id="tribe-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("accessType")}</Label>
              <Select value={accessType} onValueChange={(v) => setAccessType(v as TribeAccessType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">{t("public")}</SelectItem>
                  <SelectItem value="request">{t("request")}</SelectItem>
                  <SelectItem value="invite_only">{t("inviteOnly")}</SelectItem>
                  <SelectItem value="secret">{t("secret")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {accessType !== "secret" && (
              <div className="flex items-center justify-between">
                <Label htmlFor="tribe-listed">{t("settingsForm.showInSearch")}</Label>
                <Switch
                  id="tribe-listed"
                  checked={isListed}
                  onCheckedChange={setIsListed}
                />
              </div>
            )}

            {(accessType === "invite_only" || accessType === "secret") && inviteCode && (
              <div className="space-y-2 p-3 bg-muted rounded-lg">
                <Label>{t("inviteCode")}</Label>
                <div className="flex gap-2">
                  <Input value={inviteCode} readOnly className="font-mono" />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyCode}
                    className="shrink-0 p-2"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleRegenerateCode}
                    disabled={isPending}
                    className="shrink-0 p-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${isPending ? "animate-spin" : ""}`} />
                  </Button>
                </div>
                {copied && <p className="text-sm text-green-600">{t("codeCopied")}</p>}
                {inviteUrl && (
                  <p className="text-xs text-muted-foreground break-all">
                    Share link: {inviteUrl}
                  </p>
                )}
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="destructive"
              onClick={() => setShowDeleteModal(true)}
              className="sm:mr-auto px-3 py-2"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {t("deleteTribe")}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="px-3 py-2">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending || isUploadingCover || isUploadingAvatar} className="px-3 py-2">
              {isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteTribeModal
        tribeSlug={tribe.slug}
        tribeName={tribe.name}
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
      />
    </>
  );
}
