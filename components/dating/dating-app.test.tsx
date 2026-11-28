import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatingApp } from "./dating-app";
import en from "@/messages/en.json";
vi.mock("@/lib/i18n/routing", () => ({
  Link: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
let enabled = false,
  matched = false;
let sent = "";
const card = {
  id: "79000000-0000-4000-8000-000000000002",
  name: "Linh",
  birth_year: 1996,
  avatar_url: null,
  gender: "woman",
  interests: ["coffee"],
  liked: false,
  likes_you: true,
  matched: false,
};
const snapshot = () => ({
  profile: enabled
    ? {
        user_id: "self",
        enabled: true,
        birth_year: 1994,
        birth_date: null,
        gender: "man",
        seeking: ["woman"],
        min_age: 25,
        max_age: 35,
        interests: [],
      }
    : null,
  ready: true,
  cards: enabled ? [{ ...card, liked: matched, matched }] : [],
  audience: "only_me",
  suspended: false,
});
beforeEach(() => {
  enabled = false;
  matched = false;
  sent = "";
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opts?: RequestInit) => {
      if (opts?.method === "POST") {
        const b = JSON.parse(String(opts.body));
        if (b.operation === "profile") enabled = true;
        if (b.operation === "action") matched = true;
        if (b.operation === "message") sent = b.body;
        return Response.json({ ok: true });
      }
      if (url.includes("target="))
        return Response.json({
          messages: sent
            ? [{ id: "msg", sender_id: "self", body: sent, created_at: "now" }]
            : [],
        });
      return Response.json(snapshot());
    }),
  );
});
describe("real dating member journey", () => {
  it("opens saved preferences directly from an empty discovery list", async () => {
    enabled = true;
    vi.mocked(fetch).mockImplementation(async (_url, opts) => {
      if (opts?.method === "POST") {
        expect(JSON.parse(String(opts.body))).toMatchObject({
          operation: "profile",
          min_age: 22,
          max_age: 35,
        });
        return Response.json({ ok: true });
      }
      return Response.json({ ...snapshot(), cards: [] });
    });
    render(<DatingApp locale="en" copy={en.dating} />);
    fireEvent.click(await screen.findByRole("button", { name: "Meet people" }));
    await screen.findByText(en.dating.emptyBody);
    fireEvent.click(screen.getByRole("button", { name: "Preferences" }));
    expect(screen.getByRole("slider", { name: "Minimum age" })).toHaveValue(
      "25",
    );
    fireEvent.change(screen.getByRole("slider", { name: "Minimum age" }), {
      target: { value: "22" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
    await screen.findByText(en.dating.emptyBody);
    expect(
      vi.mocked(fetch).mock.calls.some(([, opts]) => opts?.method === "POST"),
    ).toBe(true);
  });

  it("confirms a saved one-way like even if refreshing the cards fails", async () => {
    enabled = true;
    let liked = false;
    vi.mocked(fetch).mockImplementation(async (_url, opts) => {
      if (opts?.method === "POST") {
        expect(JSON.parse(String(opts.body))).toMatchObject({
          operation: "action",
          target: card.id,
          action: "like",
        });
        liked = true;
        return Response.json({ ok: true });
      }
      if (liked) return Response.json({ code: "error" }, { status: 500 });
      return Response.json({
        ...snapshot(),
        cards: [{ ...card, likes_you: false }],
      });
    });
    render(<DatingApp locale="en" copy={en.dating} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Meet people" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Meet people" }));
    fireEvent.click(await screen.findByRole("button", { name: "Like Linh" }));
    expect(await screen.findByText(en.dating.likeSent)).toHaveAttribute(
      "role",
      "status",
    );
    expect(screen.getByRole("button", { name: "Liked Linh" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Message" }),
    ).not.toBeInTheDocument();
  });

  it("does not show discovery cards while incoming likes load", async () => {
    enabled = true;
    let finish: (value: Response) => void = () => {};
    const normal = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, opts) => {
      if (String(url).includes("kind=likes"))
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      return normal(url, opts);
    });
    render(<DatingApp locale="en" copy={en.dating} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Meet people" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Meet people" }));
    await screen.findByText("Linh");
    fireEvent.click(screen.getByRole("button", { name: en.dating.likes }));
    expect(screen.getByText(en.dating.loading)).toBeInTheDocument();
    expect(screen.queryByText("Linh")).not.toBeInTheDocument();
    finish(Response.json({ ...snapshot(), cards: [] }));
    await screen.findByText(en.dating.noLikes);
  });

  it("activates on submit and sends only after a mutual match", async () => {
    render(<DatingApp locale="en" copy={en.dating} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Meet people" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Meet people" }));
    fireEvent.change(screen.getByLabelText("Birth year"), {
      target: { value: "1994" },
    });
    fireEvent.change(screen.getByLabelText("I am"), {
      target: { value: "man" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Women" }));
    fireEvent.click(screen.getByRole("button", { name: "Meet people" }));
    await screen.findByText("Linh");
    expect(
      screen.queryByRole("button", { name: "Message" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Like Linh" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Message" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Message" }));
    await screen.findByText("You both said hello. Start a conversation.");
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "Hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(screen.getByRole("log")).toHaveTextContent("Hello"),
    );
  });
  it("keeps a new draft typed while an earlier message is sending", async () => {
    enabled = true;
    matched = true;
    let finish: () => void = () => {};
    const normal = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, opts) => {
      if (
        opts?.method === "POST" &&
        JSON.parse(String(opts.body)).operation === "message"
      )
        return new Promise<Response>((resolve) => {
          finish = () => resolve(Response.json({ ok: true }));
        });
      return normal(url, opts);
    });
    render(<DatingApp locale="en" copy={en.dating} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Meet people" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Meet people" }));
    await screen.findByRole("button", { name: "Message" });
    fireEvent.click(screen.getByRole("button", { name: "Message" }));
    await screen.findByText("You both said hello. Start a conversation.");
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "First" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "Next draft" },
    });
    finish();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Send" })).toBeEnabled(),
    );
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue(
      "Next draft",
    );
  });
  it("shows sign-in instead of member data to logged-out visitors", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ code: "unauthorized" }, { status: 401 }),
    );
    render(<DatingApp locale="en" copy={en.dating} />);
    expect(
      await screen.findByRole("link", { name: "Sign in to meet people" }),
    ).toHaveAttribute("href", expect.stringContaining("/auth/login?next="));
    expect(screen.queryByText("Linh")).not.toBeInTheDocument();
  });
});
