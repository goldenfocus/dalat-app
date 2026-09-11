"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Check,
  Compass,
  Leaf,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import type EnglishCopy from "@/messages/phuong/en.json";
import {
  emptyMeeting,
  readMeeting,
  STORAGE_KEY,
  type Meeting,
} from "./workshop-state";
import "./workshop.css";
import { WorkshopAnswers } from "./workshop-answers";

export type WorkshopCopy = typeof EnglishCopy;
const anchors = [
  "welcome",
  "vision",
  "today",
  "opportunity",
  "phuong",
  "conversation",
  "zero",
  "experiment",
  "money",
  "future",
  "decision",
];
const urls = [
  "/events/da-lat-professional-community-ai-skill-s-2mln",
  "/venues",
  "/moments",
  "/organizer",
];
const fieldKeys = [
  "experiment",
  "owner",
  "deadline",
  "success",
  "involvement",
  "checkin",
  "rights",
] as const;

function Cards({ rows }: { rows: string[][] }) {
  return (
    <div className="thu-cards">
      {rows.map(([title, body]) => (
        <article className="thu-card" key={title}>
          <h3>{title}</h3>
          <p>{body}</p>
        </article>
      ))}
    </div>
  );
}
function Flow({ items }: { items: string[] }) {
  return (
    <ol className="thu-flow">
      {items.map((item, i) => (
        <li key={item}>
          <span className="thu-step">{String(i + 1).padStart(2, "0")}</span>
          <strong>{item}</strong>
          <ArrowRight size={18} aria-hidden="true" />
        </li>
      ))}
    </ol>
  );
}
function Heading({
  n,
  title,
  text,
}: {
  n: string;
  title: string;
  text?: string;
}) {
  return (
    <header className="thu-heading">
      <span className="thu-kicker">{n}</span>
      <h2>{title}</h2>
      {text && <p>{text}</p>}
    </header>
  );
}

export function Workshop({
  copy: c,
  language,
}: {
  copy: WorkshopCopy;
  language: "en" | "vi" | "fr";
}) {
  const [meeting, setMeeting] = useState<Meeting>(emptyMeeting);
  const [ready, setReady] = useState(false);
  const [storageOK, setStorageOK] = useState(true);
  const [resetPending, setResetPending] = useState(false);
  useEffect(() => {
    // Read browser storage after the first paint; keep SSR and hydration identical.
    const frame = requestAnimationFrame(() => {
      try {
        setMeeting(readMeeting(localStorage.getItem(STORAGE_KEY)));
      } catch {
        setStorageOK(false);
      }
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  function updateMeeting(update: (previous: Meeting) => Meeting) {
    const next = update(meeting);
    setMeeting(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setStorageOK(true);
    } catch {
      setStorageOK(false);
    }
  }
  const selected = Object.keys(meeting.roles).length;
  function exportNotes() {
    const lines = [
      c.title,
      c.date,
      "",
      ...fieldKeys.map((key, i) => `${c.fields[i]}: ${meeting[key] || "—"}`),
      "",
      ...c.roles.flatMap(([title], i) =>
        meeting.roles[i] === undefined
          ? []
          : [`${title}: ${c.choices[meeting.roles[i]]}`],
      ),
      "",
      `${c.autonomyTitle}: ${meeting.level === null ? "—" : `${meeting.level} · ${c.levels[meeting.level]}`}`,
    ];
    const url = URL.createObjectURL(
      new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `dalat-phuong-${language}-meeting.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="thu-workshop" lang={language}>
      <div className="thu-toolbar">
        <div className="thu-toolbar-inner">
          <span className="thu-wordmark">
            <Leaf size={16} aria-hidden="true" /> DALAT.APP{" "}
            <span> / PHƯƠNG + ZAN</span>
          </span>
          <div className="thu-languages" aria-label="Language / Ngôn ngữ">
            <a
              href="https://phuong.dalat.app/archive/v1"
              aria-current={language === "en" ? "page" : undefined}
            >
              ENGLISH
            </a>
            <a
              href="https://phuong.dalat.app/vi/archive/v1"
              aria-current={language === "vi" ? "page" : undefined}
            >
              TIẾNG VIỆT
            </a>
            <a href="https://phuong.dalat.app/fr/archive/v1" aria-current={language === "fr" ? "page" : undefined}>
              FRANÇAIS
            </a>
          </div>
        </div>
        <nav
          aria-label={
            language === "vi" ? "Các phần buổi gặp" : language === "fr" ? "Les étapes de l’atelier" : "Meeting sections"
          }
        >
          {anchors.map((id, i) => (
            <a key={id} href={`#${id}`}>
              {c.nav[i]}
            </a>
          ))}
        </nav>
      </div>
      <div className="thu-shell">
        <section id="welcome" className="thu-hero">
          <div className="thu-hero-copy">
            <p className="thu-kicker">{c.date}</p>
            <p className="thu-eyebrow">{c.eyebrow}</p>
            <h1>
              {c.title}
              <span> × Dalat.app</span>
            </h1>
            <h2>{c.subtitle}</h2>
            <p className="thu-lede">{c.intro}</p>
            <div className="thu-actions">
              <Button haptic={false} asChild size="lg">
                <a href="#vision">
                  {c.start}
                  <ArrowDown aria-hidden="true" />
                </a>
              </Button>
              <a href="#decision" className="thu-text-link">
                {c.jump} ↗
              </a>
            </div>
          </div>
          <div className="thu-portraits">
            <figure>
              <div className="thu-portrait-photo">
                <Image src="/workshops/phuong/phuong.png" alt="Phương" fill priority sizes="(max-width: 600px) 45vw, 240px" />
              </div>
              <figcaption>Phương</figcaption>
            </figure>
            <span className="thu-portrait-plus" aria-hidden="true">+</span>
            <figure>
              <div className="thu-portrait-photo">
                <Image src="/workshops/phuong/zan.jpg" alt="Zan" fill priority sizes="(max-width: 600px) 45vw, 240px" />
              </div>
              <figcaption>Zan</figcaption>
            </figure>
          </div>
        </section>
        <p className="thu-privacy">{c.privacy}</p>
        <section id="vision" className="thu-section">
          <Heading
            n={`01 / ${c.dreamLabel}`}
            title={c.visionTitle}
            text={c.visionText}
          />
          <div className="thu-living-loop">
            <div className="thu-loop-center">
              <Compass size={32} aria-hidden="true" />
              <span>ĐÀ LẠT</span>
            </div>
            <Flow items={c.loop} />
          </div>
        </section>
        <section id="today" className="thu-section">
          <Heading n="02" title={c.todayTitle} />
          <Cards rows={c.todayCards} />
          <div className="thu-existing">
            <h3>{c.builtTitle}</h3>
            <p>{c.builtText}</p>
            <div className="thu-actions">
              {urls.map((url, i) => (
                <a
                  key={url}
                  href={`https://dalat.app${language === "en" ? "" : `/${language}`}${url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="thu-text-link"
                >
                  {c.liveLinks[i]} ↗
                </a>
              ))}
            </div>
          </div>
        </section>
        <section id="opportunity" className="thu-section">
          <Heading n="03" title={c.opportunityTitle} text={c.aha} />
          <div className="thu-panel">
            <p className="thu-kicker">{c.hypothesis}</p>
            <h3 className="thu-large">{c.flywheelTitle}</h3>
            <Flow items={c.flywheel} />
            <p>{c.flywheelMeasure}</p>
          </div>
          <article className="thu-memory">
            <Sparkles size={26} aria-hidden="true" />
            <h3>{c.archiveTitle}</h3>
            <p>{c.archiveText}</p>
            <p className="thu-memory-future">{c.archiveFuture}</p>
          </article>
          <details>
            <summary>{c.networkDetails}</summary>
            <p className="thu-kicker">{c.hypothesis}</p>
            <Cards rows={c.networks} />
          </details>
          <details>
            <summary>{c.graphDetails}</summary>
            <Cards rows={c.graphCards} />
          </details>
        </section>
        <section id="phuong" className="thu-section">
          <Heading n="04" title={c.rolesTitle} text={c.rolesText} />
          <p className="thu-selection" aria-live="polite">
            {selected} / 15 {c.selected}
          </p>
          <div className="thu-role-grid">
            {c.roles.map(([title, description], i) => (
              <article
                className={`thu-role ${meeting.roles[i] === 0 ? "thu-role-loved" : ""}`}
                key={title}
              >
                <span className="thu-role-number">
                  {String(i + 1).padStart(2, "0")}
                  {meeting.roles[i] === 0 && (
                    <Check size={18} aria-hidden="true" />
                  )}
                </span>
                <h3>{title}</h3>
                <p>{description}</p>
                <div className="thu-votes" role="group" aria-label={title}>
                  {c.choices.map((choice, j) => (
                    <button
                      key={choice}
                      type="button"
                      disabled={!ready}
                      aria-pressed={meeting.roles[i] === j}
                      onClick={() =>
                        updateMeeting((prev) => {
                          const roles = { ...prev.roles };
                          if (roles[i] === j) delete roles[i];
                          else roles[i] = j;
                          return { ...prev, roles };
                        })
                      }
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <p className="thu-aside">{c.progression}</p>
        </section>
        <section id="conversation" className="thu-section">
          <Heading
            n="05"
            title={c.conversationTitle}
            text={c.conversationText}
          />
          <WorkshopAnswers copy={c} language={language} />
        </section>
        <section id="zero" className="thu-section">
          <Heading n="06" title={c.zeroTitle} text={c.zeroText} />
          <p className="thu-aside">{c.zeroWarning}</p>
          <div className="thu-minimal">
            <div>
              <p className="thu-kicker">{c.minimalTitle}</p>
              <strong>{c.minutes}</strong>
              <Leaf size={40} aria-hidden="true" />
            </div>
            <p>{c.minimalText}</p>
          </div>
          <h3 className="thu-large">{c.autonomyTitle}</h3>
          <div className="thu-levels" role="group" aria-label={c.autonomyTitle}>
            {c.levels.map((level, i) => (
              <button
                key={level}
                type="button"
                disabled={!ready}
                aria-pressed={meeting.level === i}
                onClick={() =>
                  updateMeeting((prev) => ({
                    ...prev,
                    level: prev.level === i ? null : i,
                  }))
                }
              >
                <strong>{i}</strong>
                <span>{level}</span>
              </button>
            ))}
          </div>
          <p>{c.autonomyNote}</p>
        </section>
        <section id="experiment" className="thu-section">
          <Heading n="07" title={c.experimentTitle} text={c.experimentText} />
          <div className="thu-week">
            {c.week.map(([title, body], i) => (
              <article key={title}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </article>
            ))}
          </div>
          <details>
            <summary>{c.organizerQuestionsTitle}</summary>
            <p>{c.organizerQuestions}</p>
          </details>
          <div className="thu-ai">
            <h3 className="thu-large">{c.aiTitle}</h3>
            <blockquote>{c.aiInput}</blockquote>
            <p>{c.aiOutput}</p>
            <Flow items={c.aiSteps} />
            <p>{c.aiNote}</p>
          </div>
        </section>
        <section id="money" className="thu-section">
          <Heading n="08" title={c.moneyTitle} text={c.moneyText} />
          <div className="thu-timeline">
            {c.moneyStages.map(([title, body], i) => (
              <article key={title}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </article>
            ))}
          </div>
          <details>
            <summary>{c.packagesTitle}</summary>
            <Cards rows={c.packages} />
          </details>
        </section>
        <section id="future" className="thu-section">
          <Heading n={`09 / ${c.futureLabel}`} title={c.futureTitle} />
          <div className="thu-futures">
            {c.future.map(([year, title, body]) => (
              <article key={year}>
                <span>{year}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
          <div className="thu-metrics">
            <h3 className="thu-large">{c.metricsTitle}</h3>
            <div className="thu-northstars">
              {c.northStars.map((s, i) => (
                <div key={s}>
                  <span>0{i + 1} ↗</span>
                  <h4>{s}</h4>
                </div>
              ))}
            </div>
            <p>{c.metricsText}</p>
            <details>
              <summary>
                {language === "vi"
                  ? "Các chỉ số hỗ trợ"
                  : language === "fr" ? "Autres indicateurs" : "Supporting measures"}
              </summary>
              <p>{c.metricsMore}</p>
            </details>
          </div>
        </section>
        <section className="thu-section">
          <Heading
            n={language === "vi" ? "NGUYÊN TẮC" : language === "fr" ? "GARDE-FOUS" : "GUARDRAILS"}
            title={c.guardrailsTitle}
          />
          <Cards rows={c.guardrails} />
          <details className="thu-garden">
            <summary>
              <Leaf size={20} aria-hidden="true" />
              {c.gardenTitle}
            </summary>
            <p>{c.gardenText}</p>
            <div className="thu-chips">
              {c.garden.map((idea) => (
                <span key={idea}>{idea}</span>
              ))}
            </div>
          </details>
          <details>
            <summary>{c.challengeTitle}</summary>
            <Cards rows={c.challenges} />
          </details>
        </section>
        <section id="decision" className="thu-section thu-decision">
          <Heading n="10" title={c.decisionTitle} text={c.decisionText} />
          <div className="thu-form">
            {fieldKeys.map((key, i) => (
              <label
                key={key}
                className={
                  key === "experiment" || key === "rights"
                    ? "thu-field-wide"
                    : ""
                }
              >
                <span>{c.fields[i]}</span>
                {key === "owner" ? (
                  <select
                    disabled={!ready}
                    value={meeting.owner}
                    onChange={(e) =>
                      updateMeeting((prev) => ({
                        ...prev,
                        owner: e.target.value,
                      }))
                    }
                  >
                    <option value="">{c.owners[0]}</option>
                    <option value="Phương">Phương</option>
                    <option value="Zan">Zan</option>
                  </select>
                ) : key === "deadline" || key === "checkin" ? (
                  <input
                    disabled={!ready}
                    type={key === "deadline" ? "date" : "datetime-local"}
                    value={meeting[key]}
                    onChange={(e) =>
                      updateMeeting((prev) => ({
                        ...prev,
                        [key]: e.target.value,
                      }))
                    }
                  />
                ) : (
                  <textarea
                    disabled={!ready}
                    rows={key === "experiment" ? 3 : 2}
                    maxLength={3000}
                    value={meeting[key]}
                    onChange={(e) =>
                      updateMeeting((prev) => ({
                        ...prev,
                        [key]: e.target.value,
                      }))
                    }
                  />
                )}
              </label>
            ))}
          </div>
          <p className="thu-save-note">{c.saveNote}</p>
          <p role="status" className="thu-save-status">
            {ready ? (storageOK ? c.saved : c.saveError) : "…"}
          </p>
          <div className="thu-actions">
            <Button
              haptic={false}
              type="button"
              disabled={!ready}
              onClick={exportNotes}
            >
              {c.export}
              <ArrowDown aria-hidden="true" />
            </Button>
            <Button
              haptic={false}
              type="button"
              variant="outline"
              disabled={!ready}
              onClick={() => setResetPending(true)}
            >
              {c.reset}
            </Button>
          </div>
          {resetPending && (
            <div className="thu-aside" role="group" aria-label={c.reset}>
              <p>{c.resetConfirm}</p>
              <div className="thu-actions">
                <Button
                  haptic={false}
                  variant="destructive"
                  type="button"
                  onClick={() => {
                    updateMeeting(emptyMeeting);
                    setResetPending(false);
                  }}
                >
                  {c.confirmReset}
                </Button>
                <Button
                  haptic={false}
                  variant="outline"
                  type="button"
                  onClick={() => setResetPending(false)}
                >
                  {c.cancel}
                </Button>
              </div>
            </div>
          )}
        </section>
        <footer className="thu-closing">
          <Leaf size={28} aria-hidden="true" />
          <p>{c.closing}</p>
          <span>PHƯƠNG + ZAN × DALAT.APP</span>
        </footer>
      </div>
    </div>
  );
}
