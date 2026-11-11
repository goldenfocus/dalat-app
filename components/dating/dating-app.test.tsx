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
