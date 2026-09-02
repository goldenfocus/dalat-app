import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Locale } from "@/lib/types";
import {
  ACTIVITY_GRAPH_QUICK_FACT_LOCALES,
  ActivityGraphQuickFacts,
  getActivityGraphQuickFactsCopy,
} from "./activity-graph-quick-facts";

const baseProps = {
  locale: "en" as Locale,
  startsAt: "2026-08-30T10:00:00.000Z",
  endsAt: "2026-08-30T12:00:00.000Z",
  timeZone: "Asia/Ho_Chi_Minh",
  locationName: "Mây Lang Thang",
  address: "519 Thôn Măng Lin, Đà Lạt",
  reservationRequirement: "required" as const,
  publicAccess: "confirmed" as const,
  priceType: "free" as const,
  lastConfirmedAt: "2026-08-28T09:00:00.000Z",
  sourceMetadata: {
    source_url: "https://maylangthang.com.vn/shows/hanhi3008",
  },
};

describe("ActivityGraphQuickFacts", () => {
  it("shows only grounded planning facts and the HTTPS source", () => {
    render(<ActivityGraphQuickFacts {...baseProps} />);

    expect(
      screen.getByRole("heading", { name: "Plan this activity" }),
    ).toBeInTheDocument();
    expect(screen.getByText("When")).toBeInTheDocument();
    expect(screen.getByText("Where")).toBeInTheDocument();
    expect(screen.getByText("Reservation required")).toBeInTheDocument();
    expect(screen.getByText("Public access confirmed")).toBeInTheDocument();
    expect(screen.getByText(/Mây Lang Thang/)).toBeInTheDocument();
    expect(screen.getAllByText(/2026/)).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: /Official source/ }),
    ).toHaveAttribute("href", "https://maylangthang.com.vn/shows/hanhi3008");
  });

  it("omits unknown claims and rejects an unsafe source URL", () => {
    render(
      <ActivityGraphQuickFacts
        {...baseProps}
        reservationRequirement="unknown"
        publicAccess="unknown"
        lastConfirmedAt={null}
        sourceMetadata={{ source_url: "javascript:alert(1)" }}
      />,
    );

    expect(screen.queryByText("Booking")).not.toBeInTheDocument();
    expect(screen.queryByText("Access")).not.toBeInTheDocument();
    expect(screen.queryByText(/Last confirmed/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("uses the requested locale instead of leaking English labels", () => {
    render(<ActivityGraphQuickFacts {...baseProps} locale="vi" />);

    expect(
      screen.getByRole("heading", { name: "Lên kế hoạch cho hoạt động này" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Khi nào")).toBeInTheDocument();
    expect(screen.getByText("Cần đặt chỗ")).toBeInTheDocument();
    expect(screen.queryByText("When")).not.toBeInTheDocument();
  });

  it("shows TBD admission and unknown price for a date-known Lam Vien notice", () => {
    render(
      <ActivityGraphQuickFacts
        {...baseProps}
        startsAt="2026-09-12T16:59:59.000Z"
        endsAt={null}
        publicAccess="unknown"
        priceType={null}
        sourceMetadata={{
          source_url: "https://official.example.vn/lam-vien-notice",
          schedule_policy: "lam_vien_date_known_time_tbd",
        }}
      />,
    );

    expect(screen.getAllByText(/TBD/)).toHaveLength(2);
    expect(screen.getByText("Access")).toBeInTheDocument();
    expect(screen.getByText("Price")).toBeInTheDocument();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.queryByText(/11:59/)).not.toBeInTheDocument();
  });

  it("has deterministic copy for all twelve product locales", () => {
    expect(ACTIVITY_GRAPH_QUICK_FACT_LOCALES).toHaveLength(12);

    for (const locale of ACTIVITY_GRAPH_QUICK_FACT_LOCALES) {
      const copy = getActivityGraphQuickFactsCopy(locale);
      expect(copy.title).toBeTruthy();
      expect(copy.officialSource).toBeTruthy();
      expect(copy.priceUnknown).toBeTruthy();
      expect(copy.reservation.required).toBeTruthy();
      expect(copy.publicAccess.confirmed).toBeTruthy();
    }
  });
});
