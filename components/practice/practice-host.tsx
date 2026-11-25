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
const roundControl = "h-auto min-h-14 flex-col gap-1 whitespace-normal px-2 py-2 text-center text-xs leading-tight";
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
    setSelected(selected === id ? null : id);
  }

  const selectedActions = person ? (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button
        variant="outline"
        className="min-h-11"
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
        {t("present")}
      </Button>
      <Button
        variant="outline"
        className="min-h-11"
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
        {t("absent")}
      </Button>
      <Button
        variant="outline"
        className="min-h-11"
        onClick={() => setPreview(person.id)}
      >
        <Eye aria-hidden />
        {t("previewGuest")}
      </Button>
      {ticket && (
        <Button
          variant="outline"
          className="min-h-11"
          onClick={() => setTicketPerson(person.id)}
        >
          <QrCode aria-hidden />
          {t("code")}
        </Button>
      )}
    </div>
  ) : null;
  const canStartRound = view.count >= 2 && !!view.assignments?.length;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm tabular-nums text-muted-foreground" role="status">
          {t("rollCallProgress", { checked: view.count, total: players.length })}
        </p>
        <Button
          variant="ghost"
          className="min-h-11"
          onClick={() => setSettings(true)}
        >
          <Settings2 aria-hidden />
          {t("settings")}
        </Button>
      </div>
      {active ? (
        <div className="mb-6 space-y-3">
          <p className="text-center">
            <span className="block text-sm text-muted-foreground">
              {t("round", { number: view.round!.number })}
            </span>
            <span
              role="timer"
              aria-label={t("timer")}
              className="block text-4xl font-medium tabular-nums"
            >
              {view.round!.pausedAt
                ? t("paused")
                : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}
            </span>
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              className={roundControl}
              disabled={busy}
              onClick={() =>
                void act({ action: view.round!.pausedAt ? "resume" : "pause" })
              }
            >
              {view.round!.pausedAt ? <Play aria-hidden /> : <Pause aria-hidden />}
              {t(view.round!.pausedAt ? "resume" : "pause")}
            </Button>
            <Button
              variant="outline"
              className={roundControl}
              disabled={busy}
              onClick={() => void act({ action: "extend", seconds: 120 })}
            >
              <Plus aria-hidden />
              {t("extend")}
            </Button>
            <Button
              variant="outline"
              className={roundControl}
              disabled={busy}
              onClick={() => void act({ action: "end" })}
            >
              <Square aria-hidden />
              {t("end")}
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">{t("extendHint")}</p>
        </div>
      ) : (
        <div className="mb-6 space-y-2">
          <Button
            className="practice-primary min-h-14 w-full text-base"
            disabled={busy || !canStartRound}
            onClick={() => void act({ action: "startGame", minutes: 20 })}
          >
            <Play aria-hidden />
            {t("startGame")}
          </Button>
          {view.count > 0 && (
            <p className="text-center text-xs text-muted-foreground">
              {t(canStartRound ? "presenceHint" : view.count < 2 ? "needTwo" : "waitingPartner")}
            </p>
          )}
        </div>
      )}
      {view.count === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t("noCheckedIn")}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {view.groups.map((group, index) => {
          const table = view.assignments?.find((a) => a.groupIndex === index);
          const visibleGroup = table ? group : group.filter(member => member.presence === "present");
          if (!visibleGroup.length) return null;
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
              <h3 className="mb-4 flex items-baseline gap-2">
                <strong className="text-xl font-medium">
                  {table ? t("table", { number: table.tableNumber }) : t("waitingList")}
                </strong>
                {table && (
                  <span className="text-sm text-muted-foreground">
                    {t(table.floor)}
                  </span>
                )}
              </h3>
              <div className="space-y-2">
                {visibleGroup.map((member) => (
                  <div key={member.id}><button
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
                    <PracticePerson person={member} showSpeaks={selected === member.id} />
                  </button>{selected === member.id && selectedActions}</div>
                ))}
                {group.length < 4 && table && selected && !group.some((member) => member.id === selected) && (
                  <Button
                    variant="outline"
                    className="min-h-11 w-full"
                    disabled={busy}
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
                    {t("moveToTable", { number: table.tableNumber })}
                  </Button>
                )}
              </div>
            </section>
          );
        })}
      </div>
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
