"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { PracticeView } from "@/lib/practice/model";
import { PracticeParticipation } from "./practice-participation";
export function PracticeSettings({
  view,
  busy,
  act,
}: {
  view: PracticeView;
  busy: boolean;
  act: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const t = useTranslations("eventPractice");
  const [tables, setTables] = useState(view.tables || []),
    [policy, setPolicy] = useState(view.floorPolicy || "balanced");
  return (
    <div className="space-y-4 py-4">
      {view.me && <PracticeParticipation view={view} busy={busy} act={act} />}
      <label className="block text-sm">
        {t("floorPolicy")}
        <select
          className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3"
          value={policy}
          onChange={(e) => setPolicy(e.target.value as typeof policy)}
        >
          <option value="balanced">{t("balanced")}</option>
          <option value="upstairs">{t("preferUpstairs")}</option>
          <option value="downstairs">{t("preferDownstairs")}</option>
        </select>
      </label>
      <fieldset>
        <legend className="mb-3 text-sm">{t("availableTables")}</legend>
        <div className="grid grid-cols-2 gap-3">
          {tables.map((table) => (
            <label
              key={table.number}
              className="flex min-h-11 items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                checked={table.available}
                onChange={(e) =>
                  setTables(
                    tables.map((item) =>
                      item.number === table.number
                        ? { ...item, available: e.target.checked }
                        : item,
                    ),
                  )
                }
              />
              {t("table", { number: table.number })}
            </label>
          ))}
        </div>
      </fieldset>
      <Button
        disabled={busy}
        onClick={() =>
          void act({ action: "settings", tables, floorPolicy: policy })
        }
      >
        {t("saveSettings")}
      </Button>
    </div>
  );
}
