"use client";
import { useCallback, useEffect, useState } from "react";
import { ideaIds, type IdeaVote } from "@/lib/phuong/ideas";
import type { V2Copy } from "./v2";
const people = [
  { id: "36bdd750-ab6a-4a02-96dd-afd8d6661d29", name: "Phương" },
  { id: "303f96f6-0501-465c-9ee5-96e6136bb8bb", name: "Yan" },
];
const ratings = ["up", "unsure", "down"] as const;
const icons = { up: "👍", down: "👎", unsure: "🤔" };
export function IdeaMenu({ copy: c }: { copy: V2Copy["ideas"] }) {
  const [votes, setVotes] = useState<IdeaVote[]>([]);
  const [userId, setUserId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/phuong-ideas", { cache: "no-store" });
      if (!res.ok) throw Error();
      const data = await res.json();
      setVotes(data.votes);
      setUserId(data.userId);
      setLoaded(true);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);
  useEffect(() => {
    void load();
    const refresh = () => {
      void load();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load]);
  async function vote(ideaId: string, rating: IdeaVote["rating"]) {
    setBusy(true);
    setStatus(c.saving);
    try {
      const res = await fetch("/api/phuong-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaId, rating }),
      });
      if (!res.ok) throw Error();
      setVotes((current) => [
        ...current.filter(
          (v) => !(v.user_id === userId && v.idea_id === ideaId),
        ),
        { user_id: userId, idea_id: ideaId, rating },
      ]);
      setStatus(c.saved);
    } catch {
      setStatus(c.error);
    } finally {
      setBusy(false);
    }
  }
  function card(id: (typeof ideaIds)[number]) {
    const idea = c.items[id];
    const own = votes.find((v) => v.user_id === userId && v.idea_id === id);
    return (
      <article className="pv-idea-card" key={id}>
        <p className="pv-idea-effort">{idea.effort}</p>
        <h3>{idea.title}</h3>
        <p>{idea.description}</p>
        <div className="pv-vote-people">
          {people.map((person) => {
            const rating = votes.find(
              (v) => v.user_id === person.id && v.idea_id === id,
            )?.rating;
            return (
              <span key={person.id}>
                <strong>
                  {person.name}
                  {userId === person.id ? ` · ${c.you}` : ""}
                </strong>{" "}
                {rating
                  ? `${icons[rating]} ${c[rating]}`
                  : loaded
                    ? c.empty
                    : "…"}
              </span>
            );
          })}
        </div>
        <div className="pv-vote-buttons" role="group" aria-label={idea.title}>
          {ratings.map((rating) => (
            <button
              type="button"
              key={rating}
              disabled={!loaded || busy || loadError}
              aria-pressed={own?.rating === rating}
              onClick={() => vote(id, rating)}
            >
              {icons[rating]} {c[rating]}
            </button>
          ))}
        </div>
      </article>
    );
  }
  return (
    <section className="pv-idea-menu" id="ideas">
      <h2>{c.title}</h2>
      <p>{c.intro}</p>
      <p className="pv-idea-notice">{c.note}</p>
      <p className="pv-idea-help">{c.hint}</p>
      <button
        type="button"
        className="pv-vote-refresh"
        onClick={() => void load()}
        disabled={busy}
      >
        {c.refresh}
      </button>
      {loadError && <p role="alert">{c.loadError}</p>}
      <p role="status" aria-live="polite">
        {status}
      </p>
      <div className="pv-idea-grid">{ideaIds.slice(0, 4).map(card)}</div>
      <details className="pv-idea-more">
        <summary>
          {c.more} · {ideaIds.length - 4}
        </summary>
        <div className="pv-idea-grid">{ideaIds.slice(4).map(card)}</div>
      </details>
    </section>
  );
}
