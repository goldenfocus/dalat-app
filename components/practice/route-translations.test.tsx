import { readFileSync } from "node:fs";
import { cloneElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTENT_LOCALES } from "@/lib/types";
import type { PracticeView } from "@/lib/practice/model";
import { EventPractice } from "./event-practice";
import HostPage from "@/app/[locale]/events/[slug]/host/page";
import ArrivalPage from "@/app/[locale]/events/[slug]/arrive/page";

vi.mock("next-intl/server", () => ({ getMessages: vi.fn(), getTranslations: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "host" } } }) } }),
}));
vi.mock("@/lib/metadata", () => ({ generateLocalizedMetadata: vi.fn() }));
vi.mock("@/lib/hooks/use-viewer", () => ({ useViewer: () => ({ profile: null }) }));
vi.mock("@/lib/i18n/routing", () => ({
  usePathname: () => "/events/language-exchange-social-house-z8oc-20261104/host",
  useRouter: () => ({ replace: vi.fn() }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
// Isolate each page's real translation boundary while rendering its real
// practice panel. No live arrival data or practice mutations are needed.
vi.mock("@/components/arrival/host-workspace", () => ({ HostWorkspace: () => <EventPractice slug="sample" transport={transport} /> }));
vi.mock("@/components/arrival/guest-arrival", () => ({ GuestArrival: () => <EventPractice slug="sample" transport={transport} /> }));

const host: PracticeView = {
  canStart: true, count: 2, me: null, revision: 1, serverNow: "2026-11-04T12:00:00Z",
  tables: [{ number: 4, floor: "downstairs", capacity: 2, available: true }],
  floorPolicy: "balanced", draft: null, participation: null, myTable: null,
  round: null, groups: [], myGroup: [], myGroupNumber: null,
  participants: [{ id: "sample", name: "Mai", number: 1, speaks: ["vi"], learns: "en", participation: "playing", presence: "present" }],
};
const transport = async () => new Response(JSON.stringify(host), { status: 200 });

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe.each([["staff desk", HostPage], ["guest arrival", ArrivalPage]] as const)("%s practice translations", (_name, Page) => {
  it.each(CONTENT_LOCALES)("renders labels and accessible controls in %s through the page provider", async locale => {
    const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
    vi.mocked(getMessages).mockResolvedValue(messages);
    const t = createTranslator({ locale, messages, namespace: "eventPractice" });
    const onError = vi.fn();
    const page = await Page({ params: Promise.resolve({ locale, slug: "sample" }) });
    const { container } = render(
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC" onError={onError}>
        {/* Next's server wrapper normally supplies the request locale. */}
        {cloneElement(page, { locale })}
      </NextIntlClientProvider>,
    );

    expect(await screen.findByRole("button", { name: t("draft") })).toBeVisible();
    expect(screen.getByRole("link", { name: t("openActivity") })).toHaveAttribute("href", "https://ezviet.org/challenges?practice=1");
    expect(screen.getByRole("status")).toHaveTextContent(t("ready", { count: 2 }));
    expect(screen.getByRole("status")).toHaveTextContent(t("minutesShort", { count: 20 }));
    expect(screen.getByRole("region", { name: t("rollCall") })).toHaveTextContent(t("rollCallHint"));
    expect(screen.getByRole("button", { name: t("confirmPresent", { name: "Mai" }) })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: t("markAbsent", { name: "Mai" }) })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: t("settings") }));
    expect(screen.getByLabelText(t("duration"))).toBeVisible();
    expect(screen.getByRole("button", { name: t("saveSettings") })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: t("hostParticipants") }));
    expect(screen.getByRole("region", { name: t("hostParticipants") })).toHaveTextContent("Mai");
    expect(container.textContent).not.toMatch(/eventPractice\./);
    for (const control of container.querySelectorAll("[aria-label], [title]")) {
      expect(control.getAttribute("aria-label") ?? control.getAttribute("title")).not.toMatch(/eventPractice\./);
    }
    expect(onError).not.toHaveBeenCalled();
  });
});
