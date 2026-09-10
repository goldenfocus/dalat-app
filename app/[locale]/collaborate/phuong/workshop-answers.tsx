"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { WorkshopCopy } from "./workshop";

type Answer = { question_id: number; content: string; updated_at: string };
type Author = { id: string; name: string; username: string | null };

export function WorkshopAnswers({ copy: c, language }: { copy: WorkshopCopy; language: string }) {
  const t = c.answers;
  const [author, setAuthor] = useState<Author | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/workshop-answers", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) return null;
        if (!response.ok) throw Error("unavailable");
        return response.json();
      })
      .then((data) => {
        setAuthor(data?.author ?? null);
        setAnswers(data?.answers ?? []);
        setError(false);
        setLoaded(true);
      })
      .catch(() => { if (!controller.signal.aborted) { setError(true); setLoaded(true); } });
    return () => controller.abort();
  }, [attempt]);

  return <>
    <div className="thu-answer-intro" aria-live="polite">
      {!loaded ? <p>{t.loading}</p> : error ? <p>{t.loadError} <button type="button" onClick={() => setAttempt(attempt + 1)}>{t.retry}</button></p> : author ? <>
        <p><strong>{t.writingAs} {author.name}</strong>{author.username && <> · @{author.username}</>}</p>
        <p>{t.privacy}</p>
      </> : <><p>{t.loginNote}</p><Button asChild><a href={`/${language}/auth/login`}>{t.login}</a></Button></>}
    </div>
    <div className="thu-prompts">
      {c.prompts.map(([question, text], i) => <details key={i}>
        <summary><span className="thu-prompt-number">{i + 1}</span>{question}</summary>
        <p>{text}</p>
        {loaded && author && !error && <AnswerEditor key={`${author.id}:${i}`} id={i + 1} initial={answers.find(a => a.question_id === i + 1)} author={author} question={question} language={language} t={t} />}
      </details>)}
    </div>
  </>;
}

function AnswerEditor({ id, initial, author, question, language, t }: {
  id: number; initial?: Answer; author: Author; question: string; language: string; t: WorkshopCopy["answers"];
}) {
  const [value, setValue] = useState(initial?.content ?? "");
  const [saved, setSaved] = useState(initial?.content ?? "");
  const [date, setDate] = useState(initial?.updated_at ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "expired">("idle");
  const dirty = value !== saved;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function save() {
    setStatus("saving");
    try {
      // Re-check identity before saving: a different account must never inherit this editor.
      const session = await fetch("/api/workshop-answers", { cache: "no-store" });
      if (!session.ok || (await session.json()).author.id !== author.id) { setStatus("expired"); return; }
      const response = await fetch("/api/workshop-answers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: id, content: value, expected_author_id: author.id }),
      });
      if (response.status === 401 || response.status === 409) { setStatus("expired"); return; }
      if (!response.ok) throw Error("save");
      const { answer } = await response.json();
      setSaved(answer.content); setDate(answer.updated_at); setStatus("idle");
    } catch { setStatus("error"); }
  }
  return <div className="thu-answer-editor">
    <label htmlFor={`answer-${id}`}>{t.yourAnswer} · {author.name}<span className="sr-only">: {question}</span></label>
    <textarea id={`answer-${id}`} rows={5} maxLength={6000} value={value} disabled={status === "saving"} onChange={e => { setValue(e.target.value); setStatus("idle"); }} placeholder={t.placeholder} />
    <div className="thu-answer-actions">
      <Button type="button" onClick={save} disabled={!dirty || status === "saving"}>{status === "saving" ? t.saving : t.save}</Button>
      <span role="status">{status === "error" ? t.saveError : status === "expired" ? t.expired : dirty ? t.unsaved : date ? `${t.saved} · ${new Date(date).toLocaleString(language)}` : t.empty}</span>
      <small>{value.length}/6000</small>
    </div>
  </div>;
}
