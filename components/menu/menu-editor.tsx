"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import type { MenuItemRow, MenuSectionRow } from "@/lib/menu/types";

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
  "section";

const ITEM_COLS =
  "id,section_id,name,name_i18n,description,description_i18n,price_vnd,tags,image_url,is_available,is_sold_out,sort";

function ItemRow({ item, onChange, onDelete }: {
  item: MenuItemRow;
  onChange: (next: MenuItemRow) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("venueMenu");
  const db = createClient();
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? "");
  const [price, setPrice] = useState(String(item.price_vnd));
  const [busy, setBusy] = useState(false);

  const priceNum = Number.parseInt(price.replace(/\D/g, ""), 10);
  const dirty =
    name !== item.name || description !== (item.description ?? "") || priceNum !== item.price_vnd;

  const patch = async (fields: Partial<MenuItemRow>, quiet = false) => {
    setBusy(true);
    const { data, error } = await db.from("venue_menu_items").update(fields).eq("id", item.id).select(ITEM_COLS).single();
    setBusy(false);
    if (error || !data) {
      toast.error(t("errorGeneric"));
      return;
    }
    onChange(data as MenuItemRow);
    if (!quiet) toast.success(t("saved"));
  };

  const save = () =>
    patch({
      name: name.trim(),
      description: description.trim() || null,
      price_vnd: Number.isFinite(priceNum) ? priceNum : item.price_vnd,
      // stale translations would contradict the new wording — fall back to it
      ...(name !== item.name && { name_i18n: {} }),
      ...(description !== (item.description ?? "") && { description_i18n: {} }),
    });

  return (
    <li className={`space-y-3 p-4 ${item.is_available ? "" : "opacity-60"}`}>
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">{t("itemName")}</span>
          <Input className="text-base" maxLength={160} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">{t("itemPrice")}</span>
          <Input className="text-base tabular-nums" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">{t("itemDescription")}</span>
        <Textarea className="text-base" rows={2} maxLength={600} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <Switch checked={item.is_available} disabled={busy} onCheckedChange={(v) => patch({ is_available: v }, true)} />
          {t("listed")}
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <Switch checked={item.is_sold_out} disabled={busy} onCheckedChange={(v) => patch({ is_sold_out: v }, true)} />
          {t("soldOut")}
        </label>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" size="sm" className="min-h-11" disabled={!dirty || busy || !name.trim()} onClick={save}>
            {t("save")}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-11 w-11 text-destructive"
            aria-label={t("delete")}
            onClick={() => window.confirm(t("confirmDeleteItem")) && onDelete()}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </li>
  );
}

export function MenuEditor({ venueId, initialSections, preorderEnabled }: {
  venueId: string;
  initialSections: MenuSectionRow[];
  preorderEnabled: boolean;
}) {
  const t = useTranslations("venueMenu");
  const db = createClient();
  const [sections, setSections] = useState(initialSections);
  const [preorders, setPreorders] = useState(preorderEnabled);
  const [newSection, setNewSection] = useState("");

  const updateItem = (sid: string, next: MenuItemRow) =>
    setSections((all) => all.map((s) => (s.id === sid ? { ...s, items: s.items.map((i) => (i.id === next.id ? next : i)) } : s)));

  const deleteItem = async (sid: string, id: string) => {
    const { data, error } = await db.from("venue_menu_items").delete().eq("id", id).select("id");
    if (error || !data?.length) return toast.error(t("errorGeneric"));
    setSections((all) => all.map((s) => (s.id === sid ? { ...s, items: s.items.filter((i) => i.id !== id) } : s)));
  };

  const addItem = async (s: MenuSectionRow) => {
    const sort = (s.items.at(-1)?.sort ?? 0) + 10;
    const { data, error } = await db
      .from("venue_menu_items")
      .insert({ venue_id: venueId, section_id: s.id, name: t("newItem"), price_vnd: 0, sort })
      .select(ITEM_COLS)
      .single();
    if (error || !data) return toast.error(t("errorGeneric"));
    setSections((all) => all.map((x) => (x.id === s.id ? { ...x, items: [...x.items, data as MenuItemRow] } : x)));
  };

  const addSection = async () => {
    const title = newSection.trim();
    if (!title) return;
    const taken = new Set(sections.map((s) => s.slug));
    let slug = slugify(title);
    for (let n = 2; taken.has(slug); n++) slug = `${slugify(title)}-${n}`;
    const sort = (sections.at(-1)?.sort ?? 0) + 10;
    const { data, error } = await db
      .from("venue_menu_sections")
      .insert({ venue_id: venueId, slug, title, sort })
      .select("id,slug,title,title_i18n,note,note_i18n,sort,is_visible")
      .single();
    if (error || !data) return toast.error(t("errorGeneric"));
    setSections((all) => [...all, { ...(data as Omit<MenuSectionRow, "items">), items: [] }]);
    setNewSection("");
  };

  const patchSection = async (id: string, fields: Partial<MenuSectionRow>) => {
    const { data, error } = await db.from("venue_menu_sections").update(fields).eq("id", id).select("id");
    if (error || !data?.length) return toast.error(t("errorGeneric"));
    setSections((all) => all.map((s) => (s.id === id ? { ...s, ...fields } : s)));
  };

  const deleteSection = async (id: string) => {
    const { data, error } = await db.from("venue_menu_sections").delete().eq("id", id).select("id");
    if (error || !data?.length) return toast.error(t("errorGeneric"));
    setSections((all) => all.filter((s) => s.id !== id));
  };

  // Through the API: managers aren't covered by the venues owner RLS policy,
  // so a direct update would match 0 rows without an error.
  const togglePreorders = async (v: boolean) => {
    setPreorders(v);
    const res = await fetch(`/api/venues/${venueId}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preorder_enabled: v }),
    }).catch(() => null);
    if (!res?.ok) {
      setPreorders(!v);
      toast.error(t("errorGeneric"));
    }
  };

  return (
    <div className="space-y-8">
      <label className="flex items-start gap-3 rounded-xl border p-4">
        <Switch checked={preorders} onCheckedChange={togglePreorders} className="mt-0.5" />
        <span>
          <span className="block font-medium">{t("acceptPreorders")}</span>
          <span className="block text-sm text-muted-foreground">{t("acceptPreordersHint")}</span>
        </span>
      </label>

      {sections.map((s) => (
        <section key={s.id} className="rounded-xl border">
          <div className="space-y-2 border-b p-4">
            <div className="flex items-center gap-2">
              <Input
                aria-label={t("sectionTitle")}
                className="text-base font-semibold"
                defaultValue={s.title}
                maxLength={120}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== s.title) patchSection(s.id, { title: v, title_i18n: {} });
                }}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-11 w-11 shrink-0 text-destructive"
                aria-label={t("delete")}
                onClick={() => window.confirm(t("confirmDeleteSection")) && deleteSection(s.id)}
              >
                <Trash2 />
              </Button>
            </div>
            <Textarea
              aria-label={t("sectionNote")}
              placeholder={t("sectionNote")}
              className="text-base"
              rows={2}
              maxLength={600}
              defaultValue={s.note ?? ""}
              onBlur={(e) => {
                const v = e.target.value.trim() || null;
                if (v !== s.note) patchSection(s.id, { note: v, note_i18n: {} });
              }}
            />
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <Switch checked={s.is_visible} onCheckedChange={(v) => patchSection(s.id, { is_visible: v })} />
              {t("sectionVisible")}
            </label>
          </div>
          <ul className="divide-y">
            {s.items.map((i) => (
              <ItemRow key={i.id} item={i} onChange={(n) => updateItem(s.id, n)} onDelete={() => deleteItem(s.id, i.id)} />
            ))}
          </ul>
          <div className="border-t p-3">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => addItem(s)}>
              <Plus /> {t("addItem")}
            </Button>
          </div>
        </section>
      ))}

      <div className="flex gap-2">
        <Input
          aria-label={t("sectionTitle")}
          placeholder={t("sectionTitle")}
          className="text-base"
          value={newSection}
          maxLength={120}
          onChange={(e) => setNewSection(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addSection()}
        />
        <Button type="button" className="min-h-11 shrink-0" disabled={!newSection.trim()} onClick={addSection}>
          <Plus /> {t("addSection")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("translationsNote")}</p>
    </div>
  );
}
