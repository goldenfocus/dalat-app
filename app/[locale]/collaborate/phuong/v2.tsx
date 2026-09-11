"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  birthdayChoices,
  emptyPlan,
  planSchema,
  type Plan,
} from "@/lib/phuong/plan";
import type English from "@/messages/phuong/v2/en.json";
import "./v2.css";
export type V2Copy = typeof English;
type Action = {
  id: string;
  kind: keyof V2Copy["actionNames"];
  author_id: string;
  content: { message?: string };
  created_at: string;
};
const PHUONG = "36bdd750-ab6a-4a02-96dd-afd8d6661d29";
export function PhuongV2({
  copy: c,
  language,
}: {
  copy: V2Copy;
  language: string;
}) {
  const [role, setRole] = useState<"phuong" | "zan" | null>(null);
  const [access, setAccess] = useState("loading");
  const [plan, setPlan] = useState<Plan>(emptyPlan);
  const [baseline, setBaseline] = useState(JSON.stringify(emptyPlan()));
  const [version, setVersion] = useState(0);
  const [actions, setActions] = useState<Action[]>([]);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [messageStatus, setMessageStatus] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [messageId, setMessageId] = useState<string | null>(null);
  const pendingSave = useRef<{ signature: string; id: string } | null>(null);
  const dirty = JSON.stringify(plan) !== baseline;
  const editable = role === "phuong";
  const interested =
    plan.birthday !== null &&
    (plan.birthday !== "private" || plan.normalExperiment);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/phuong-plan", { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        if (res.status === 401) {
          setAccess("login");
          return;
        }
        if (res.status === 403) {
          setAccess("denied");
          return;
        }
        if (!res.ok) throw Error();
        const data = await res.json();
        const saved = planSchema.parse(data.plan.content);
        setRole(data.role);
        setPlan(saved);
        setBaseline(JSON.stringify(saved));
        setVersion(data.plan.version);
        setActions(data.actions);
        setAccess("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setAccess("error");
      });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    if (!dirty && !message) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, message]);
  function change<K extends keyof Plan>(key: K, value: Plan[K]) {
    setPlan((p) => ({ ...p, [key]: value }));
    setStatus("");
  }
  async function submit(
    action: "decision" | "baseline" | "brief" | "results" | "message",
  ) {
    const isMessage = action === "message";
    if (!isMessage && !plan.birthday) {
      setStep(0);
      return;
    }
    setBusy(true);
    if (isMessage) setMessageStatus("");
    else setStatus("");
    const signature = JSON.stringify({ action, version, plan });
    if (!isMessage && pendingSave.current?.signature !== signature)
      pendingSave.current = { signature, id: crypto.randomUUID() };
    const requestId = isMessage
      ? (messageId ?? crypto.randomUUID())
      : pendingSave.current!.id;
    if (isMessage) setMessageId(requestId);
    try {
      const res = await fetch("/api/phuong-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isMessage
            ? { requestId, action, message }
            : { requestId, action, expectedVersion: version, plan },
        ),
      });
      if (!res.ok) throw Error(res.status === 409 ? "conflict" : "saveError");
      const result = await res.json();
      if (!isMessage) {
        setVersion(result.version);
        pendingSave.current = null;
      }
      if (isMessage) {
        setMessage("");
        setMessageId(null);
        setMessageStatus(role === "phuong" ? c.messageSaved : c.saved);
      } else {
        setBaseline(JSON.stringify(plan));
        setStatus(c.saved);
      }
      const latest = await fetch("/api/phuong-plan", { cache: "no-store" });
      if (latest.ok) setActions((await latest.json()).actions);
    } catch (e) {
      const text =
        c[
          e instanceof Error && e.message === "conflict"
            ? "conflict"
            : "saveError"
        ];
      if (isMessage) setMessageStatus(text);
      else setStatus(text);
    } finally {
      setBusy(false);
    }
  }
  function field(key: keyof Plan, label: string, numeric = false) {
    return (
      <label className="pv-field" key={key}>
        <span>{label}</span>
        {numeric ? (
          <input
            inputMode="decimal"
            type="text"
            maxLength={12}
            value={String(plan[key])}
            disabled={!editable || busy}
            onChange={(e) => {
              if (/^\d*(\.\d{0,2})?$/.test(e.target.value))
                change(key, e.target.value);
            }}
          />
        ) : (
          <textarea
            rows={2}
            maxLength={2000}
            value={String(plan[key])}
            disabled={!editable || busy}
            onChange={(e) => change(key, e.target.value)}
          />
        )}
      </label>
    );
  }
  function chips(key: "vibe" | "activities", items: string[]) {
    return (
      <div className="pv-chips">
        {items.map((label, i) => (
          <button
            key={i}
            type="button"
            disabled={!editable || busy}
            aria-pressed={plan[key].includes(String(i))}
            onClick={() =>
              change(
                key,
                plan[key].includes(String(i))
                  ? plan[key].filter((x) => x !== String(i))
                  : [...plan[key], String(i)],
              )
            }
          >
            {label}
          </button>
        ))}
      </div>
    );
  }
  const prefix = language === "en" ? "" : `/${language}`;
  return (
    <div className="pv">
      <nav className="pv-top" aria-label="Workshop">
        <a href="#idea">{c.quick}</a>
        <a href="#planner">{c.details}</a>
        <a href={`${prefix}/archive/v1`}>{c.archive}</a>
        <div className="pv-languages">
          {[
            ["en", "EN"],
            ["vi", "VI"],
            ["fr", "FR"],
          ].map(([l, label]) => (
            <a
              key={l}
              href={`https://phuong.dalat.app${l === "en" ? "/" : `/${l}`}`}
              aria-current={language === l ? "page" : undefined}
            >
              {label}
            </a>
          ))}
        </div>
      </nav>
      <section className="pv-hero" id="idea">
        <div>
          <p className="pv-kicker">{c.kicker}</p>
          <h1>{c.title}</h1>
          <p>{c.intro}</p>
          <a className="pv-cta" href="#planner">
            {c.details} ↘
          </a>
        </div>
        <div className="pv-portraits" aria-label="Phương + Zan">
          <figure>
            <span className="pv-hat" aria-hidden="true" />
            <Image
              src="/workshops/phuong/phuong.png"
              alt="Phương"
              width={360}
              height={420}
              priority
            />
            <figcaption>Phương</figcaption>
          </figure>
          <span className="pv-plus" aria-hidden="true">
            +
          </span>
          <figure>
            <span className="pv-hat pv-hat-gold" aria-hidden="true" />
            <Image
              src="/workshops/phuong/zan.jpg"
              alt="Zan"
              width={360}
              height={420}
              priority
            />
            <figcaption>Zan</figcaption>
          </figure>
          <span className="pv-spark" aria-hidden="true">
            ✧
          </span>
        </div>
      </section>
      <section className="pv-glass pv-planner" id="planner">
        <p className="pv-kicker">ĐƯỜNG 1 CHILL · ĐÀ LẠT</p>
        {access !== "ready" ? (
          <div className="pv-access">
            <h2>{c.birthday}</h2>
            <p>{c.birthdayText}</p>
            <p role="status">
              {access === "loading"
                ? c.loading
                : access === "login"
                  ? c.loginNote
                  : access === "denied"
                    ? c.denied
                    : c.error}
            </p>
            {access === "login" ? (
              <Button asChild>
                <a href={`/${language}/auth/login`}>{c.login}</a>
              </Button>
            ) : access === "error" ? (
              <Button onClick={() => setAttempt(attempt + 1)}>{c.retry}</Button>
            ) : null}
          </div>
        ) : (
          <>
            <p className="pv-private">
              {role === "zan" ? c.review : c.privacy}
            </p>
            <div className="pv-stepper">
              {c.steps.map((s, i) => (
                <button
                  key={s}
                  aria-current={step === i ? "step" : undefined}
                  onClick={() => setStep(i)}
                >
                  {i + 1}. {s}
                </button>
              ))}
            </div>
            {step === 0 && (
              <div className="pv-step">
                <h2>{c.birthday}</h2>
                <p>{c.birthdayText}</p>
                {field("birthdayPlans", c.plans)}
                <div className="pv-decisions">
                  {birthdayChoices.map((choice, i) => (
                    <button
                      key={choice}
                      aria-pressed={plan.birthday === choice}
                      disabled={!editable || busy}
                      onClick={() => change("birthday", choice)}
                    >
                      {c.choices[i]}
                    </button>
                  ))}
                </div>
                {plan.birthday === "date" && (
                  <label className="pv-field">
                    {c.date}
                    <input
                      type="date"
                      value={plan.date}
                      disabled={!editable || busy}
                      onInput={(e) => change("date", e.currentTarget.value)}
                      onChange={(e) => change("date", e.target.value)}
                    />
                  </label>
                )}
                {plan.birthday === "idea" && field("alternative", c.idea)}
                {plan.birthday === "private" && (
                  <>
                    <p>{c.noIdea}</p>
                    <label className="pv-check">
                      <input
                        type="checkbox"
                        checked={plan.normalExperiment}
                        disabled={!editable || busy}
                        onChange={(e) =>
                          change("normalExperiment", e.target.checked)
                        }
                      />
                      {c.normal}
                    </label>
                  </>
                )}
                {editable && (
                  <Button
                    disabled={busy || !plan.birthday}
                    onClick={() => submit("decision")}
                  >
                    {busy ? c.saving : c.save}
                  </Button>
                )}
              </div>
            )}
            {step === 1 && (
              <div className="pv-step">
                <h2>{c.baseline}</h2>
                <p>{c.baselineText}</p>
                {field("responsibilities", c.businessFields.responsibilities)}
                <div className="pv-grid">
                  {field("capacity", c.businessFields.capacity, true)}
                  {field("customers", c.businessFields.customers, true)}
                </div>
                {field("timeSink", c.businessFields.timeSink)}
                {field("aiHelp", c.businessFields.aiHelp)}
                <details>
                  <summary>{c.more}</summary>
                  <div className="pv-grid">
                    {field("revenue", c.businessFields.revenue, true)}
                    {field("spend", c.businessFields.spend, true)}
                  </div>
                  {(
                    [
                      "greatNight",
                      "workflow",
                      "pain",
                      "extraHours",
                      "customerSources",
                      "quietNights",
                    ] as const
                  ).map((k) => field(k, c.businessFields[k]))}
                </details>
                {editable && (
                  <Button
                    disabled={busy || !plan.birthday}
                    onClick={() => submit("baseline")}
                  >
                    {busy ? c.saving : c.save}
                  </Button>
                )}
              </div>
            )}
            {step === 2 && (
              <div className="pv-step">
                <h2>{c.party}</h2>
                {!interested ? (
                  <p>{c.noIdea}</p>
                ) : (
                  <>
                    <p>{c.partyText}</p>
                    <div className="pv-grid">
                      <label className="pv-field">
                        {c.date}
                        <input
                          type="date"
                          value={plan.date}
                          disabled={!editable || busy}
                          onInput={(e) => change("date", e.currentTarget.value)}
                          onChange={(e) => change("date", e.target.value)}
                        />
                      </label>
                      <label className="pv-field">
                        {c.time}
                        <input
                          type="time"
                          value={plan.startTime}
                          disabled={!editable || busy}
                          onChange={(e) => change("startTime", e.target.value)}
                        />
                      </label>
                    </div>
                    {field("eventName", c.name)}
                    <div className="pv-chips">
                      {c.suggestions.map((name) => (
                        <button
                          key={name}
                          disabled={!editable || busy}
                          onClick={() => change("eventName", name)}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                    <h3>{c.vibe}</h3>
                    {chips("vibe", c.vibes)}
                    {field("rsvpCap", c.cap, true)}
                    <fieldset>
                      <legend>{c.drink}</legend>
                      <div className="pv-chips">
                        {(["yes", "no", "maybe"] as const).map((value, i) => (
                          <button
                            key={value}
                            type="button"
                            disabled={!editable || busy}
                            aria-pressed={plan.drink === value}
                            onClick={() => change("drink", value)}
                          >
                            {c.drinkChoices[i]}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    {plan.drink !== "no" && field("drinkNotes", c.drinkNotes)}
                    <h3>{c.activities}</h3>
                    {chips("activities", c.activityChoices)}
                    {field("notes", c.notes)}
                    <p className="pv-private">{c.publishNote}</p>
                    {editable && (
                      <Button disabled={busy} onClick={() => submit("brief")}>
                        {busy ? c.saving : c.brief}
                      </Button>
                    )}
                    <p>
                      <a
                        href={`https://dalat.app${prefix}/events/new`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {c.tools}
                      </a>
                    </p>
                  </>
                )}
              </div>
            )}
            <div className="pv-bottom">
              <button disabled={step === 0} onClick={() => setStep(step - 1)}>
                ← {c.back}
              </button>
              <span role="status">
                {status || (dirty ? c.unsaved : version > 0 ? c.saved : "")}
              </span>
              <button disabled={step === 2} onClick={() => setStep(step + 1)}>
                {c.next} →
              </button>
            </div>
          </>
        )}
      </section>
      <section className="pv-loop">
        <h2>{c.loopTitle}</h2>
        <ol>
          {c.loop.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ol>
        <p>{c.loopNote}</p>
      </section>
      {access === "ready" && (
        <section className="pv-grid pv-extras">
          <div className="pv-glass">
            <h2>{c.messageTitle}</h2>
            <textarea
              aria-label={c.messageTitle}
              placeholder={c.messagePlaceholder}
              rows={4}
              maxLength={3000}
              value={message}
              disabled={busy}
              onChange={(e) => {
                setMessage(e.target.value);
                setMessageId(null);
                setMessageStatus("");
              }}
            />
            <Button
              disabled={busy || !message.trim()}
              onClick={() => submit("message")}
            >
              {busy ? c.saving : c.send}
            </Button>
            <p role="status">{messageStatus}</p>
          </div>
          <div className="pv-glass">
            <h2>{c.history}</h2>
            {!actions.length ? (
              <p>{c.emptyHistory}</p>
            ) : (
              <ol className="pv-history">
                {actions.slice(0, 12).map((a) => (
                  <li key={a.id}>
                    <strong>
                      {a.author_id === PHUONG ? c.byPhuong : c.byZan} ·{" "}
                      {c.actionNames[a.kind]}
                    </strong>
                    <time>
                      {new Date(a.created_at).toLocaleString(language, {
                        timeZone: "Asia/Ho_Chi_Minh",
                      })}{" "}
                      · UTC+7
                    </time>
                    {a.kind === "message" && <p>{a.content.message}</p>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      )}
      {access === "ready" && (
        <details className="pv-glass pv-results">
          <summary>{c.outcomes}</summary>
          <div className="pv-grid">
            <div>
              <h3>{c.normalNight}</h3>
              <p>
                {c.businessFields.customers}: {plan.customers || "—"}
              </p>
              <p>
                {c.businessFields.revenue}: {plan.revenue || "—"}
              </p>
            </div>
            <div>
              <h3>{c.experimentNight}</h3>
              {field("actualCustomers", c.actualCustomers, true)}
              {field("actualRevenue", c.actualRevenue, true)}
            </div>
          </div>
          {field("outcome", c.outcome)}
          {editable && (
            <Button
              disabled={busy || !plan.birthday}
              onClick={() => submit("results")}
            >
              {c.saveResults}
            </Button>
          )}
          <p>{c.futureMetrics}</p>
        </details>
      )}
      <section className="pv-grid pv-notes">
        <div>
          <h2>{c.aiTitle}</h2>
          <p>{c.aiText}</p>
        </div>
        <div>
          <h2>{c.mutualTitle}</h2>
          <p>{c.phuongBrings}</p>
          <p>{c.zanBrings}</p>
          <small>{c.mutualNote}</small>
        </div>
      </section>
      <footer>
        <a href={`${prefix}/archive/v1`}>{c.archive} ↗</a>
        <p>PHƯƠNG + ZAN · ONE SMALL EXPERIMENT</p>
      </footer>
    </div>
  );
}
