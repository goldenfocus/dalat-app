"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { amenityKeys, areaKeys, detailGroups, ruleKeys, utilityKeys, type RentalDetails } from "@/lib/rentals/details";

const control = "min-h-11 w-full rounded-xl border bg-background px-3 text-sm";
const fieldset = "min-w-0 space-y-4 rounded-2xl border bg-card px-4 pb-4 sm:px-5";
type Group = typeof detailGroups[number];

function CustomEntries({ group, items }: { group: Group; items: RentalDetails["custom"] }) {
  const t = useTranslations("rentalsDetails");
  const common = useTranslations("common");
  const [rows, setRows] = useState(items.map((item, id) => ({ ...item, id })));
  const [nextId, setNextId] = useState(items.length);
  return <div className="grid gap-2">
    {rows.map(({ id, label, pricing }) => (
      <div key={id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <input aria-label={t(group + "Entry")} placeholder={t(group + "Entry")} name={group + ".label"}
            className={control + (group !== "amenities" ? " sm:col-span-3" : "")} defaultValue={label} maxLength={1000} />
          {group === "amenities" && <>
            <select aria-label={t("pricing")} name={group + ".pricing"} className={control}
              defaultValue={typeof pricing === "number" ? "paid" : pricing}>
              <option value="">{t("unspecified")}</option>
              <option value="included">{t("included")}</option>
              <option value="notIncluded">{t("notIncluded")}</option>
              <option value="paid">{t("paid")}</option>
            </select>
            <input aria-label={t("amount")} placeholder={t("amount")} name={group + ".amount"}
              className={control} inputMode="numeric" pattern="[0-9]+" defaultValue={typeof pricing === "number" ? pricing : undefined} />
          </>}
        </div>
        <button type="button" aria-label={common("remove")} className="grid size-11 place-items-center rounded-xl border hover:bg-muted"
          onClick={() => setRows(rows.filter(row => row.id !== id))}><X className="size-4" /></button>
      </div>
    ))}
    <button type="button" className="inline-flex min-h-11 items-center gap-2 justify-self-start rounded-xl border px-3 text-sm font-medium hover:bg-muted"
      disabled={rows.length >= 30}
      onClick={() => { setRows([...rows, { group, label: "", id: nextId, pricing: undefined }]); setNextId(nextId + 1); }}>
      <Plus className="size-4" aria-hidden="true" />{t(group + "Add")}
    </button>
  </div>;
}

export function RentalDetailsEditor({ details }: { details: RentalDetails }) {
  const t = useTranslations("rentalsDetails");
  const pilot = useTranslations("rentalsPilot");
  const presets = (name: "amenities" | "area", keys: readonly string[]) => <div className="flex flex-wrap gap-2">
    {keys.map(key => <label key={key} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm">
      <input name={name} type="checkbox" value={key} defaultChecked={(details[name] as string[]).includes(key)} />
      {key === "wifi" || key === "quiet" ? pilot(key) : t(key)}
    </label>)}
  </div>;
  const select = (name: string, key: typeof utilityKeys[number] | typeof ruleKeys[number], value: string | undefined,
    options: ("included" | "notIncluded" | "allowed" | "notAllowed")[]) => <label className="grid min-w-0 gap-1 text-sm" key={key}>
    {t(key)}
    <select name={name + "." + key} className={control} defaultValue={value}>
      <option value="">{t("unspecified")}</option>
      {options.map(option => <option value={option} key={option}>{t(option)}</option>)}
    </select>
  </label>;
  const entries = (group: Group) => <CustomEntries group={group} items={details.custom.filter(item => item.group === group)} />;
  return <>
    <fieldset className={fieldset}>
      <legend className="px-2 font-semibold">{pilot("amenities")}</legend>
      {presets("amenities", amenityKeys)}
      <div className="grid gap-3 sm:grid-cols-3">
        {utilityKeys.map(key => select("utility", key, details.utilities[key], ["included", "notIncluded"]))}
      </div>
      {entries("amenities")}
    </fieldset>
    <fieldset className={fieldset}>
      <legend className="px-2 font-semibold">{pilot("area")}</legend>
      {presets("area", areaKeys)}
      {entries("area")}
      {entries("nearby")}
    </fieldset>
    <fieldset className={fieldset}>
      <legend className="px-2 font-semibold">{pilot("rules")}</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {ruleKeys.map(key => select("rule", key, details.rules[key], ["allowed", "notAllowed"]))}
        <label className="grid gap-1 text-sm">{t("minimumChildAge")}
          <input className={control} name="minimumChildAge" defaultValue={details.minimumChildAge}
            inputMode="numeric" pattern="[0-9]{1,2}" maxLength={2} />
        </label>
      </div>
      {entries("rules")}
    </fieldset>
  </>;
}
