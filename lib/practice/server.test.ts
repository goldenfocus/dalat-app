import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ context: vi.fn(), guestToken: vi.fn(), ownReceipt: vi.fn(), cookie: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocked.cookie }) }));
vi.mock("@/lib/arrival/server", () => ({ arrivalContext: mocked.context, guestToken: mocked.guestToken, ownReceipt: mocked.ownReceipt, participantColumns: "id,user_id,nickname", tokenHash: (value: string) => `hash:${value}` }));
import { claimPracticeTicket, issuePracticeTicket, confirmArrival, mutatePractice, readPractice } from "./server";
import type { PracticeState } from "./model";

type Row = Record<string, unknown>;
const slug = "language-exchange-social-house-z8oc-20261104";
let rows: Record<string, Row[]>;
let actor: { id: string } | null;
let host: boolean;
let rejectCompareAndSwap: boolean;
let writes: number;

function database() {
  return {
    rpc: mocked.rpc,
    from(table: string) {
      let filters: ((row: Row) => boolean)[] = [];
      let update: Row | null = null;
      let insert: Row | null = null;
      const execute = () => {
        const data = (rows[table] || []).filter(row => filters.every(matches => matches(row)));
        if (insert) {
          if (table === "event_practice_rooms" && rows[table].length) return { data: null, error: { code: "23505" } };
          rows[table].push(structuredClone({ revision: 0, ...insert })); writes++;
          return { data: null, error: null };
        }
        if (update) {
          if (rejectCompareAndSwap) return { data: [], error: null };
          for (const row of data) Object.assign(row, structuredClone(update));
          writes += data.length;
        }
        return { data: structuredClone(data), error: null };
      };
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
        not: (key: string, _operation: string, value: unknown) => { filters.push(row => row[key] !== value); return query; },
        in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
        order: () => query,
        maybeSingle: async () => { const result = execute(); return { ...result, data: result.data?.[0] || null }; },
        single: async () => { const result = execute(); return { ...result, data: result.data?.[0] || null }; },
        insert: (value: Row) => { insert = value; return query; },
        update: (value: Row) => { update = value; return query; },
        then: <T>(fulfilled: (value: ReturnType<typeof execute>) => T) => Promise.resolve(execute()).then(fulfilled),
      };
      return query;
    },
  };
}
function state() { return rows.event_practice_rooms[0]?.state as PracticeState | undefined; }
function revision() { return rows.event_practice_rooms[0]?.revision as number ?? -1; }

beforeEach(() => {
  vi.clearAllMocks();
  actor = { id: "owner" }; host = true; rejectCompareAndSwap = false; writes = 0;
  rows = {
    event_arrival_participants: [
      { id: "owner-arrival", event_id: "event", user_id: "owner", nickname: "Working owner", checked_in_at: "2026-11-04T11:00Z", practice_language: "english" },
      { id: "player-a", event_id: "event", user_id: "a", nickname: "Player A", checked_in_at: "2026-11-04T11:01Z", practice_language: "english" },
      { id: "player-b", event_id: "event", user_id: null, nickname: "Player B", checked_in_at: "2026-11-04T11:02Z", practice_language: "vietnamese" },
    ],
    rsvps: [{ id: "no-show", event_id: "event", user_id: "absent", status: "going", checked_in_at: null, profiles: { display_name: "Not arrived" } }],
    event_practice_rooms: [{ event_id: "event", revision: 0, state: { rounds: [], presence: { "owner-arrival": "present", "player-a": "present", "player-b": "present" } } }], event_staff: [],
    events: [{ id: "event", created_by: "owner", venue_id: "venue", venues: { owner_id: "owner" } }],
    venue_managers: [], profiles: [],
  };
  mocked.context.mockImplementation(async () => ({ admin: database(), user: actor, event: { id: "event", isOpen: true }, access: { canManage: host, canWelcome: host } }));
  mocked.guestToken.mockResolvedValue(null);
  mocked.ownReceipt.mockResolvedValue(null);
  mocked.cookie.mockReturnValue(undefined);
});

describe("practice mutations", () => {
  it("uses arrival as presence and seats pending RSVPs before the host starts", async () => {
    rows.event_practice_rooms = [];
    const initial = await readPractice(slug);
    expect(initial.count).toBe(2);
    expect(initial.participants?.find(person => person.id === "player-a")?.presence).toBe("present");
    expect(initial.groups.flat().map(p => p.id).sort()).toEqual(["player-a", "player-b", "rsvp:no-show"]);
    const started = await mutatePractice(slug, { action: "startGame", expectedRevision: revision() });
    expect(started.groups.flat().map(p => p.id).sort()).toEqual(["player-a", "player-b", "rsvp:no-show"]);
    expect(started.count).toBe(2);
    expect(rows.event_arrival_participants).toHaveLength(3);
  });
  it("persists an X, preserves arrivals and invalidates the draft until absence is corrected", async () => {
    const draft = await mutatePractice(slug, { action: "draft", expectedRevision: revision() });
    await mutatePractice(slug, { action: "presence", participantId: "player-b", status: "absent", expectedRevision: revision() });
    const refreshed = await readPractice(slug);
    expect(refreshed.count).toBe(1);
    expect(refreshed.participants?.find(person => person.id === "player-b")?.presence).toBe("absent");
    expect(refreshed.draft).toBeNull();
    expect(rows.event_arrival_participants).toHaveLength(3);
    await expect(mutatePractice(slug, { action: "start", draftId: draft.draft!.id, expectedRevision: revision() })).rejects.toThrow("status_conflict");
    await mutatePractice(slug, { action: "presence", participantId: "player-b", status: "present", expectedRevision: revision() });
    expect((await mutatePractice(slug, { action: "draft", expectedRevision: revision() })).count).toBe(2);
  });
  it("restricts presence answers to hosts and enforces revision checks", async () => {
    actor = { id: "a" }; host = false;
    await expect(mutatePractice(slug, { action: "presence", participantId: "player-a", status: "present", expectedRevision: revision() })).rejects.toThrow("forbidden");
    actor = { id: "owner" }; host = true;
    await expect(mutatePractice(slug, { action: "presence", participantId: "missing", status: "absent", expectedRevision: revision() })).rejects.toThrow("participant_not_found");
    await mutatePractice(slug, { action: "presence", participantId: "player-b", status: "absent", expectedRevision: revision() });
    await expect(mutatePractice(slug, { action: "presence", participantId: "player-b", status: "present", expectedRevision: 0 })).rejects.toThrow("status_conflict");
    actor = null; host = false;
    mocked.guestToken.mockResolvedValue("receipt");
    mocked.ownReceipt.mockResolvedValue({ participant: { id: "player-b" } });
    await mutatePractice(slug, { action: "participation", status: "playing", expectedRevision: revision() });
    expect((await readPractice(slug)).presence).toBe("absent");
  });
  it("keeps a published round fixed when the host marks someone absent", async () => {
    const draft = await mutatePractice(slug, { action: "draft", expectedRevision: revision() });
    await mutatePractice(slug, { action: "start", draftId: draft.draft!.id, expectedRevision: revision() });
    const published = structuredClone(state()!.rounds[0]);
    await mutatePractice(slug, { action: "presence", participantId: "player-b", status: "absent", expectedRevision: revision() });
    expect(state()!.rounds[0].assignments).toEqual(published.assignments);
    expect(state()!.rounds[0].groups.flat().map(p => p.id)).toContain("player-b");
    expect((await readPractice(slug)).count).toBe(1);
  });
  it("excludes working venue owner and no-shows by default; drafting publishes nothing", async () => {
    const view = await mutatePractice(slug, { action: "draft", minutes: 12, expectedRevision: revision() });
    expect(view.count).toBe(2);
    expect(view.participants?.find(p => p.id === "owner-arrival")?.participation).toBe("hosting");
    expect(view.draft?.groups.flat().map(p => p.id).sort()).toEqual(["player-a", "player-b"]);
    expect(view.round).toBeNull();
    expect(state()?.rounds).toEqual([]);
    expect(view.revision).toBe(1);
  });
  it("allows a host to opt in and publishes the exact reviewed draft only once", async () => {
    await mutatePractice(slug, { action: "participation", status: "playing", expectedRevision: revision() });
    const draft = await mutatePractice(slug, { action: "draft", minutes: 12, expectedRevision: revision() });
    const started = await mutatePractice(slug, { action: "start", draftId: draft.draft!.id, expectedRevision: revision() });
    expect(started.groups.flat()).toHaveLength(3);
    expect(state()?.rounds[0].groups).toEqual(draft.draft?.groups);
    expect(state()?.rounds[0].assignments).toEqual(draft.draft?.assignments);
    await expect(mutatePractice(slug, { action: "start", draftId: draft.draft!.id, expectedRevision: draft.revision! })).rejects.toThrow("status_conflict");
    expect(state()?.rounds).toHaveLength(1);
  });
  it("seats a late arrival immediately without changing existing physical tables", async () => {
    const first = await mutatePractice(slug, { action: "startGame", expectedRevision: revision() });
    const table = first.assignments![0].tableNumber;
    rows.event_arrival_participants.push({ id: "late", event_id: "event", user_id: "late-user", nickname: "Late", checked_in_at: "now", practice_language: "english" });
    actor = { id: "late-user" }; host = false;
    const seated = await readPractice(slug);
    expect(seated.me?.id).toBe("late");
    expect(seated.presence).toBe("present");
    expect(seated.myGroup?.map(p => p.id).sort()).toEqual(["late", "player-a", "player-b", "rsvp:no-show"]);
    expect(seated.myTable?.tableNumber).toBe(table);
    expect(seated.participants).toBeUndefined();
  });
  it.each(["departure", "language", "tables", "floor"])("still rejects a reviewed draft after a %s change", async change => {
    const draft = await mutatePractice(slug, { action: "draft", minutes: 12, expectedRevision: revision() });
    if (change === "departure") rows.event_arrival_participants = rows.event_arrival_participants.filter(person => person.id !== "player-a");
    if (change === "language") rows.event_arrival_participants[1].practice_language = "vietnamese";
    if (change === "tables") state()!.tables = [];
    if (change === "floor") state()!.floorPolicy = "upstairs";
    await expect(mutatePractice(slug, { action: "start", draftId: draft.draft!.id, expectedRevision: revision() })).rejects.toThrow("status_conflict");
    expect(state()?.rounds).toHaveLength(0);
  });
  it("invalidates draft on participation change and requires a fresh review", async () => {
    const draft = await mutatePractice(slug, { action: "draft", minutes: 12, expectedRevision: revision() });
    await mutatePractice(slug, { action: "participation", status: "visiting", participantId: "player-a", expectedRevision: revision() });
    expect(state()?.draft).toBeNull();
    await expect(mutatePractice(slug, { action: "start", draftId: draft.draft!.id, expectedRevision: revision() })).rejects.toThrow("status_conflict");
  });
  it("lets a recognized guest change only their own status without re-registering", async () => {
    actor = null; host = false;
    mocked.guestToken.mockResolvedValue("receipt");
    mocked.ownReceipt.mockResolvedValue({ participant: { id: "player-b" } });
    const view = await mutatePractice(slug, { action: "participation", status: "break", expectedRevision: revision() });
    expect(view.participation).toBe("break");
    expect(view.count).toBe(1);
    expect(rows.event_arrival_participants).toHaveLength(3);
    await expect(mutatePractice(slug, { action: "participation", status: "left", participantId: "player-a", expectedRevision: revision() })).rejects.toThrow("forbidden");
    await expect(mutatePractice(slug, { action: "draft", minutes: 12, expectedRevision: revision() })).rejects.toThrow("forbidden");
    expect(view.participants).toBeUndefined();
  });
  it("does not let anonymous visitors create attendance or alter the room", async () => {
    actor = null; host = false;
    await expect(mutatePractice(slug, { action: "participation", status: "playing", expectedRevision: revision() })).rejects.toThrow("participant_not_found");
    expect(writes).toBe(0);
  });
  it("rejects concurrent writes with compare-and-swap", async () => {
    await mutatePractice(slug, { action: "draft", minutes: 12, expectedRevision: revision() });
    rejectCompareAndSwap = true;
    await expect(mutatePractice(slug, { action: "participation", status: "playing", expectedRevision: revision() })).rejects.toThrow("status_conflict");
    expect(writes).toBe(1);
  });
  it("completes two rounds with persisted pause/extend/end and new partner assignments", async () => {
    rows.event_arrival_participants.push({ id: "player-c", event_id: "event", user_id: null, nickname: "C", checked_in_at: "now", practice_language: "english" }, { id: "player-d", event_id: "event", user_id: null, nickname: "D", checked_in_at: "now", practice_language: "vietnamese" }, { id: "player-e", event_id: "event", user_id: null, nickname: "E", checked_in_at: "now", practice_language: "english" }, { id: "player-f", event_id: "event", user_id: null, nickname: "F", checked_in_at: "now", practice_language: "vietnamese" });
    state()!.presence = { ...state()!.presence, "player-c": "present", "player-d": "present", "player-e": "present", "player-f": "present" };
    let draft = await mutatePractice(slug, { action: "draft", minutes: 12, expectedRevision: revision() });
    await mutatePractice(slug, { action: "start", draftId: draft.draft!.id, expectedRevision: revision() });
    await mutatePractice(slug, { action: "pause", expectedRevision: revision() });
    expect((await readPractice(slug)).round?.pausedAt).toBeTruthy();
    const oldRemaining = state()!.rounds[0].remainingSeconds!;
    await mutatePractice(slug, { action: "extend", seconds: 120, expectedRevision: revision() });
    expect(state()!.rounds[0].remainingSeconds).toBe(oldRemaining + 120);
    await mutatePractice(slug, { action: "resume", expectedRevision: revision() });
    await mutatePractice(slug, { action: "end", expectedRevision: revision() });
    draft = await mutatePractice(slug, { action: "draft", minutes: 12, expectedRevision: revision() });
    const firstPartner = state()!.rounds[0].groups.find(g => g.some(p => p.id === "player-a"))!.map(p => p.id).sort();
    const nextPartner = draft.draft!.groups.find(g => g.some(p => p.id === "player-a"))!.map(p => p.id).sort();
    expect(nextPartner).not.toEqual(firstPartner);
    await mutatePractice(slug, { action: "start", draftId: draft.draft!.id, expectedRevision: revision() });
    expect(state()?.rounds).toHaveLength(2);
  });
});

describe("editable pre-start practice drafts", () => {
  function addPlayers() {
    // Six confirmed players make two tables of three.
    state()!.presence = { ...state()!.presence, "player-c": "present", "player-d": "present", "player-e": "present", "player-f": "present" };
    rows.event_arrival_participants.push(
      { id: "player-c", event_id: "event", user_id: null, nickname: "C", checked_in_at: "now", practice_language: "english" },
      { id: "player-d", event_id: "event", user_id: null, nickname: "D", checked_in_at: "now", practice_language: "vietnamese" },
      { id: "player-e", event_id: "event", user_id: null, nickname: "E", checked_in_at: "now", practice_language: "english" },
      { id: "player-f", event_id: "event", user_id: null, nickname: "F", checked_in_at: "now", practice_language: "vietnamese" },
    );
  }
  it("uses twenty minutes when duration is omitted but leaves explicit duration intact", async () => {
    let draft = await mutatePractice(slug, { action: "draft", expectedRevision: revision() });
    expect(draft.draft?.minutes).toBe(20);
    draft = await mutatePractice(slug, { action: "draft", minutes: 12, expectedRevision: revision() });
    expect(draft.draft?.minutes).toBe(12);
  });
  it("publishes the manually reviewed swap and rejects the original draft ID", async () => {
    addPlayers();
    const draft = await mutatePractice(slug, { action: "draft", expectedRevision: revision() });
    const first = draft.draft!.groups[0][0], second = draft.draft!.groups[1][0];
    const edited = await mutatePractice(slug, { action: "swap", draftId: draft.draft!.id, participantId: first.id, withParticipantId: second.id, expectedRevision: revision() });
    expect(edited.draft?.id).not.toBe(draft.draft!.id);
    expect(edited.draft?.groups[0][0].id).toBe(second.id);
    expect(edited.draft?.groups[1][0].id).toBe(first.id);
    expect(edited.draft?.assignments).toEqual(draft.draft!.assignments);
    expect(edited.round).toBeNull();
    await expect(mutatePractice(slug, { action: "start", draftId: draft.draft!.id, expectedRevision: revision() })).rejects.toThrow("status_conflict");
    const started = await mutatePractice(slug, { action: "start", draftId: edited.draft!.id, expectedRevision: revision() });
    expect(started.groups.map(g => g.map(p => p.id))).toEqual(edited.draft!.groups.map(g => g.map(p => p.id)));
    expect(started.round?.minutes).toBe(20);
  });
  it("rejects non-host edits, stale rosters, same-group swaps and concurrent changes", async () => {
    addPlayers();
    const draft = await mutatePractice(slug, { action: "draft", expectedRevision: revision() });
    const payload = { action: "swap" as const, draftId: draft.draft!.id, participantId: draft.draft!.groups[0][0].id, withParticipantId: draft.draft!.groups[1][0].id, expectedRevision: revision() };
    actor = { id: "a" }; host = false;
    await expect(mutatePractice(slug, payload)).rejects.toThrow("forbidden");
    actor = { id: "owner" }; host = true;
    await expect(mutatePractice(slug, { ...payload, withParticipantId: draft.draft!.groups[0][1].id })).rejects.toThrow("invalid_draft_swap");
    rejectCompareAndSwap = true;
    await expect(mutatePractice(slug, payload)).rejects.toThrow("status_conflict");
    rejectCompareAndSwap = false;
    rows.event_arrival_participants.push({ id: "late", event_id: "event", user_id: null, nickname: "Late", checked_in_at: "now", practice_language: "english" });
    state()!.presence = { ...state()!.presence, late: "present" };
    await expect(mutatePractice(slug, payload)).rejects.toThrow("status_conflict");
    expect(state()?.draft?.id).toBe(draft.draft!.id);
  });
  it("edits the next draft while leaving the running round untouched", async () => {
    addPlayers();
    const firstDraft = await mutatePractice(slug, { action: "draft", minutes: 12, expectedRevision: revision() });
    await mutatePractice(slug, { action: "start", draftId: firstDraft.draft!.id, expectedRevision: revision() });
    const originalRound = structuredClone(state()!.rounds[0]);
    const nextDraft = await mutatePractice(slug, { action: "draft", expectedRevision: revision() });
    await mutatePractice(slug, { action: "swap", draftId: nextDraft.draft!.id, participantId: nextDraft.draft!.groups[0][0].id, withParticipantId: nextDraft.draft!.groups[1][0].id, expectedRevision: revision() });
    expect(state()?.rounds[0]).toEqual(originalRound);
  });
  it("sources avatars only from profile IDs already linked to arrivals, never guest names", async () => {
    rows.profiles = [
      { id: "a", role: "user", avatar_url: "https://example.test/player-a.jpg" },
      { id: "unrelated", role: "user", avatar_url: "https://example.test/unrelated.jpg" },
    ];
    rows.event_arrival_participants[2].nickname = "Player A";
    const view = await readPractice(slug);
    expect(view.participants?.find(p => p.id === "player-a")?.avatarUrl).toBe("https://example.test/player-a.jpg");
    expect(view.participants?.find(p => p.id === "player-b")?.avatarUrl).toBeUndefined();
    expect(view.participants?.find(p => p.id === "player-a")?.participation).toBe("playing");
    expect(JSON.stringify(view)).not.toContain("unrelated.jpg");
    rows.profiles[0].avatar_url = "javascript:alert(1)";
    expect((await readPractice(slug)).participants?.find(p => p.id === "player-a")?.avatarUrl).toBeUndefined();
  });
});

describe("door and staff arrival confirmation", () => {
  const late = { id: "late", event_id: "event", user_id: null, nickname: "Late", checked_in_at: "now", practice_language: "vietnamese", english_level: "fluent", vietnamese_level: "starting" };
  async function startRound() {
    const draft = await mutatePractice(slug, { action: "draft", expectedRevision: revision() });
    await mutatePractice(slug, { action: "start", draftId: draft.draft!.id, expectedRevision: revision() });
  }
  it("confirms presence before any round and creates the room when missing", async () => {
    rows.event_practice_rooms = [];
    expect(await confirmArrival(slug, "player-a")).toBe(true);
    expect(state()?.presence).toEqual({ "player-a": "present" });
    expect(state()?.rounds).toEqual([]);
    expect(revision()).toBe(0);
  });
  it("seats a door arrival in the running round without a host and keeps the draft under review", async () => {
    await startRound();
    const nextDraft = await mutatePractice(slug, { action: "draft", expectedRevision: revision() });
    rows.event_arrival_participants.push(late);
    actor = null; host = false;
    const before = revision();
    expect(await confirmArrival(slug, "late")).toBe(true);
    expect(revision()).toBe(before + 1);
    expect(state()!.presence!.late).toBe("present");
    expect(state()!.rounds[0].groups[0].map(person => person.id)).toContain("late");
    expect(state()!.rounds[0].groups.flat().find(p => p.id === "late")).toMatchObject({ id: "late", speaks: ["en"], learns: "vi" });
    expect(state()!.draft?.id).toBe(nextDraft.draft!.id);
    mocked.guestToken.mockResolvedValue("receipt");
    mocked.ownReceipt.mockResolvedValue({ participant: { id: "late" } });
    const view = await readPractice(slug);
    expect(view.myTable?.tableNumber).toBeTruthy();
    expect(view.myGroup?.map(person => person.id).sort()).toEqual(["late", "player-a", "player-b", "rsvp:no-show"]);
  });
  it("is idempotent and never seats working staff", async () => {
    await startRound();
    await confirmArrival(slug, "player-a");
    const settled = revision();
    expect(await confirmArrival(slug, "player-a")).toBe(true);
    expect(revision()).toBe(settled);
    expect(await confirmArrival(slug, "owner-arrival")).toBe(true);
    expect(state()!.rounds[0].groups.flat().map(person => person.id)).not.toContain("owner-arrival");
  });
  it("ignores other events and unknown people, and swallows every failure", async () => {
    const before = writes;
    expect(await confirmArrival("some-other-event", "player-a")).toBe(false);
    expect(mocked.context).not.toHaveBeenCalled();
    expect(await confirmArrival(slug, "missing")).toBe(false);
    rejectCompareAndSwap = true;
    rows.event_arrival_participants.push(late);
    expect(await confirmArrival(slug, "late")).toBe(false);
    expect(mocked.context).toHaveBeenCalledTimes(4);
    mocked.context.mockRejectedValueOnce(new Error("unavailable"));
    await expect(confirmArrival(slug, "late")).resolves.toBe(false);
    expect(writes).toBe(before);
  });
  it("retries after a concurrent host write", async () => {
    await startRound();
    rows.event_arrival_participants.push(late);
    rejectCompareAndSwap = true;
    const original = mocked.context.getMockImplementation()!;
    let calls = 0;
    mocked.context.mockImplementation(async () => { if (++calls === 2) rejectCompareAndSwap = false; return original(); });
    expect(await confirmArrival(slug, "late")).toBe(true);
    expect(calls).toBe(2);
    expect(state()!.rounds[0].groups.flat().map(person => person.id)).toContain("late");
  });
});

it("starts the game and persists table assignments in one host mutation", async () => {
  const started = await mutatePractice(slug, { action: "startGame", expectedRevision: revision() });
  expect(started.round?.minutes).toBe(20);
  expect(started.groups.flat().map(p => p.id).sort()).toEqual(["player-a", "player-b", "rsvp:no-show"]);
  expect(started.round?.assignments).toHaveLength(1);
  expect(started.draft).toBeNull();
  expect(writes).toBe(1);
  await expect(mutatePractice(slug, { action: "startGame", expectedRevision: revision() })).rejects.toThrow("status_conflict");
  expect(state()?.rounds).toHaveLength(1);
});
it("restricts one-click game start to staff and the open event window", async () => {
  actor = { id: "a" }; host = false;
  await expect(mutatePractice(slug, { action: "startGame", expectedRevision: revision() })).rejects.toThrow("forbidden");
  actor = { id: "owner" }; host = true;
  mocked.context.mockResolvedValue({ admin: database(), user: actor, event: { id: "event", isOpen: false }, access: { canManage: true } });
  await expect(mutatePractice(slug, { action: "startGame", expectedRevision: revision() })).rejects.toThrow("event_not_open_for_arrival");
  expect(writes).toBe(0);
});


describe("private host-issued guest receipts", () => {
  it("requires host authority to issue and exposes only the claimed table", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "local-unit-test-secret";
    await readPractice(slug);
    const issued = await issuePracticeTicket(slug, "player-b");
    actor = null; host = false;
    await expect(issuePracticeTicket(slug, "player-b")).rejects.toThrow("forbidden");
    const claim = await claimPracticeTicket(slug, issued.token);
    expect(claim.view.me?.id).toBe("player-b");
    expect(claim.view.canStart).toBe(false);
    expect(claim.view.participants).toBeUndefined();
    expect(JSON.stringify(claim.view)).not.toContain("receiptCode");
    await expect(claimPracticeTicket(slug, issued.token + "tampered")).rejects.toThrow("invalid_request");
  });
});

it("does not rewrite unchanged JSONB seating when PostgreSQL returns keys in another order", async () => {
  await readPractice(slug);
  const reverseKeys = (value: unknown): unknown => Array.isArray(value) ? value.map(reverseKeys) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverseKeys(item)])) : value;
  rows.event_practice_rooms[0].state = reverseKeys(state());
  const before = { revision: revision(), writes };
  await readPractice(slug);
  await readPractice(slug);
  expect(revision()).toBe(before.revision);
  expect(writes).toBe(before.writes);
});

it("honors a ticket issued before an RSVP becomes an arrival", async () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "local-unit-test-secret";
  const issued = await issuePracticeTicket(slug, "rsvp:no-show");
  rows.event_arrival_participants.push({ id: "new-arrival", event_id: "event", user_id: "absent", nickname: "Not arrived", checked_in_at: "now", practice_language: "english" });
  actor = null; host = false;
  expect((await claimPracticeTicket(slug, issued.token)).view.me?.id).toBe("new-arrival");
});

it("checks in only the RSVP named by a valid guest receipt and keeps the reserved table", async () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "local-unit-test-secret";
  const planned = await readPractice(slug);
  const table = planned.assignments?.find(a => planned.groups[a.groupIndex].some(p => p.id === "rsvp:no-show"))?.tableNumber;
  const issued = await issuePracticeTicket(slug, "rsvp:no-show");
  rows.event_language_profiles = [{ user_id: "absent", preferences: { speaks: [{ language: "vi", level: "native" }], learning: { language: "en", level: "new" } } }];
  actor = null; host = false;
  mocked.cookie.mockReturnValue({ value: issued.token });
  mocked.rpc.mockImplementation(async (name, args) => {
    expect(name).toBe("arrival_submit");
    expect(args.p_actor_id).toBe("absent");
    rows.event_arrival_participants.push({ id: "claimed-arrival", user_id: "absent", event_id: "event", nickname: "Not arrived", checked_in_at: "now", practice_language: "english" });
    return { data: {}, error: null };
  });
  const arrived = await mutatePractice(slug, { action: "arrive", expectedRevision: revision() });
  expect(arrived.me?.id).toBe("claimed-arrival");
  expect(arrived.presence).toBe("present");
  expect(arrived.myTable?.tableNumber).toBe(table);
});
