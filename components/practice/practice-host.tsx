"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Check,
  Eye,
  Pause,
  Play,
  Plus,
  QrCode,
  Settings2,
  Square,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { PracticeView } from "@/lib/practice/model";
import { PracticePerson } from "./practice-person";
import { PracticeGuest } from "./practice-guest";
import { PracticeTicket } from "./practice-ticket";
import { PracticeSettings } from "./practice-settings";
type Props = {
  ticket?: (id: string) => Promise<string>;
  view: PracticeView;
  busy: boolean;
  remaining: number;
  changeoverRemaining: number;
  act: (payload: Record<string, unknown>) => Promise<void>;
};
export function PracticeHost({ view, busy, act, remaining, ticket }: Props) {
  const t = useTranslations("eventPractice");
  const [selection, setSelected] = useState<string | null>(null),
    [preview, setPreview] = useState<string | null>(null),
    [settings, setSettings] = useState(false),
    [ticketPerson, setTicketPerson] = useState<string | null>(null);
  const people = view.participants || [],
    players = people.filter((p) => p.participation === "playing");
  const active =
    !!view.round &&
    !view.round.endedAt &&
    (remaining > 0 || !!view.round.pausedAt);
  const selected = people.some(p => p.id === selection) ? selection : null;
  const person = people.find((p) => p.id === selected);
  const previewPerson = people.find((p) => p.id === preview),
    previewGroup = view.groups.findIndex((g) =>
      g.some((p) => p.id === preview),
    );
  const previewView: PracticeView = {
    ...view,
    canStart: false,
    participants: undefined,
    groups: previewGroup < 0 ? [] : [view.groups[previewGroup]],
    me: previewPerson || null,
    myGroup: previewGroup < 0 ? [] : view.groups[previewGroup],
    myTable:
      view.assignments?.find((a) => a.groupIndex === previewGroup) || null,
    presence: previewPerson?.presence,
  };
  function choose(id: string) {
    if (
      !selected ||
      !people.some((p) => p.id === selected) ||
      selected === id
    ) {
      setSelected(selected === id ? null : id);
      return;
    }
    const first = view.groups.findIndex((g) =>
        g.some((p) => p.id === selected),
      ),
      second = view.groups.findIndex((g) => g.some((p) => p.id === id));
    if (first === second) {
      setSelected(id);
      return;
    }
    void act({
      action: "move",
      participantId: selected,
      withParticipantId: id,
    });
    setSelected(null);
  }
  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-2">
        <p
          className="text-sm tabular-nums text-muted-foreground"
          aria-label={t("rollCallProgress", {
            checked: view.count,
            total: players.length,
          })}
        >
          {view.count}/{players.length}
        </p>
        <div className="flex items-center gap-1">
          {active && (
            <span
              role="timer"
              aria-label={t("timer")}
              className="mr-2 text-xs tabular-nums text-muted-foreground"
            >
              {view.round?.pausedAt
                ? t("paused")
                : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}
            </span>
          )}
          {active ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                disabled={busy}
                aria-label={t(view.round!.pausedAt ? "resume" : "pause")}
                onClick={() =>
                  void act({
                    action: view.round!.pausedAt ? "resume" : "pause",
                  })
                }
              >
                {view.round!.pausedAt ? (
                  <Play aria-hidden />
                ) : (
                  <Pause aria-hidden />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={busy}
                aria-label={t("extend")}
                onClick={() => void act({ action: "extend", seconds: 120 })}
              >
                <Plus aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={busy}
                aria-label={t("end")}
                onClick={() => void act({ action: "end" })}
              >
                <Square aria-hidden />
              </Button>
            </>
          ) : (
            <Button
              size="icon"
              className="practice-primary h-12 w-12"
              disabled={busy || view.count < 2}
              aria-label={t("startGame")}
              onClick={() => void act({ action: "startGame", minutes: 20 })}
            >
              <Play aria-hidden />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("settings")}
            onClick={() => setSettings(true)}
          >
            <Settings2 aria-hidden />
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {view.groups.map((group, index) => {
          const table = view.assignments?.find((a) => a.groupIndex === index);
          return (
            <section
              key={`${table?.tableNumber}-${index}`}
              className="practice-table"
              aria-label={
                table
                  ? t("table", { number: table.tableNumber })
                  : t("group", { number: index + 1 })
              }
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (!people.some((p) => p.id === id) || !table) return;
                void act({
                  action: "moveToTable",
                  participantId: id,
                  tableNumber: table.tableNumber,
                });
              }}
            >
              <h3 className="mb-4 flex items-baseline gap-3">
                <strong className="text-xl font-medium">
                  {table?.tableNumber || index + 1}
                </strong>
                <span className="text-xs text-muted-foreground">
                  {table?.floor === "upstairs" ? "↑2" : "↓1"}
                </span>
              </h3>
              <div className="space-y-2">
                {group.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    draggable
                    disabled={busy}
                    aria-pressed={selected === member.id}
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/plain", member.id)
                    }
                    onDrop={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/plain");
                      if (id !== member.id && people.some((p) => p.id === id))
                        void act({
                          action: "move",
                          participantId: id,
                          withParticipantId: member.id,
                        });
                    }}
                    onClick={() => choose(member.id)}
                    className="practice-person-button min-h-12 w-full rounded-lg p-1 text-left"
                  >
                    <PracticePerson person={member} />
                  </button>
                ))}
                {group.length < 4 && table && (
                  <Button
                    variant="ghost"
                    className="min-h-11 w-full"
                    disabled={busy || !selected}
                    aria-label={t("moveToTable", { number: table.tableNumber })}
                    onClick={() => {
                      void act({
                        action: "moveToTable",
                        participantId: selected,
                        tableNumber: table.tableNumber,
                      });
                      setSelected(null);
                    }}
                  >
                    <Plus aria-hidden className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {person && (
        <div className="mt-4 flex items-center gap-2">
          <span className="mr-auto text-sm">{person.name}</span>
          {ticket && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("code")}
              onClick={() => setTicketPerson(person.id)}
            >
              <QrCode aria-hidden />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("previewGuest")}
            onClick={() => setPreview(person.id)}
          >
            <Eye aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={busy}
            aria-label={t("confirmPresent", { name: person.name })}
            onClick={() =>
              void act({
                action: "presence",
                participantId: person.id,
                status: "present",
              })
            }
          >
            <Check aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={busy}
            aria-label={t("markAbsent", { name: person.name })}
            onClick={() =>
              void act({
                action: "presence",
                participantId: person.id,
                status: "absent",
              })
            }
          >
            <UserX aria-hidden />
          </Button>
        </div>
      )}
      {ticket && ticketPerson && (
        <PracticeTicket
          person={people.find((p) => p.id === ticketPerson)!}
          ticket={ticket}
          onClose={() => setTicketPerson(null)}
        />
      )}
      <Sheet open={settings} onOpenChange={setSettings}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[90dvh] max-w-lg overflow-y-auto p-5"
        >
          <SheetHeader>
            <SheetTitle>{t("settings")}</SheetTitle>
          </SheetHeader>
          <PracticeSettings view={view} busy={busy} act={act} />
        </SheetContent>
      </Sheet>
      <Sheet
        open={!!preview}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <SheetContent
          side="bottom"
          className="practice-experience mx-auto max-h-[90dvh] max-w-lg overflow-y-auto p-5"
        >
          <SheetHeader>
            <SheetTitle>
              {t("previewGuest")} · {previewPerson?.name}
            </SheetTitle>
          </SheetHeader>
          <PracticeGuest
            view={previewView}
            readOnly
            busy={false}
            act={async () => {}}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
