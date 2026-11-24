import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RentalHostCard } from "./host-card";

vi.mock("@/lib/i18n/routing", () => ({
  Link: ({
    href,
    children,
    ...props
  }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const labels = {
  listedBy: "Listed by",
  zalo: "Zalo",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  phone: "Call",
};

const host = {
  username: "yan",
  display_name: "Yan Lovez",
  bio: "Hey there! I'm a creator who loves bringing ideas to life. ✨",
  avatar_url: "https://cdn.dalat.app/avatars/yan.jpg",
  zalo: "0369169913",
  whatsapp: "+15148653435",
  telegram: "@yanlovez",
  phone: null as string | null,
};

describe("RentalHostCard", () => {
  it("renders avatar, bio, and only the contact channels that are set", () => {
    render(<RentalHostCard host={host} labels={labels} />);
    expect(screen.getByText("Yan Lovez")).toBeInTheDocument();
    expect(
      screen.getByText(/creator who loves bringing ideas/),
    ).toBeInTheDocument();
    const zalo = screen.getByRole("link", { name: "Zalo" });
    expect(zalo).toHaveAttribute("href", "https://zalo.me/0369169913");
    expect(zalo).toHaveAttribute("target", "_blank");
    expect(zalo).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.getByRole("link", { name: "WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/15148653435",
    );
    expect(screen.getByRole("link", { name: "Telegram" })).toHaveAttribute(
      "href",
      "https://t.me/yanlovez",
    );
    expect(
      screen.queryByRole("link", { name: "Call" }),
    ).not.toBeInTheDocument();
  });

  it("omits contact buttons when no fields are set", () => {
    render(
      <RentalHostCard
        host={{
          ...host,
          zalo: null,
          whatsapp: null,
          telegram: null,
          phone: null,
        }}
        labels={labels}
      />,
    );
    expect(
      screen.queryByRole("link", { name: "Zalo" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Yan Lovez")).toBeInTheDocument();
  });
});
