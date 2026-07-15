import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TicketTierInput, type TicketTier } from "@/components/events/ticket-tier-input";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const tier = (price = 0): TicketTier => ({
  name: "",
  price,
  currency: "VND",
  description: "",
});

function renderPaid(tiers: TicketTier[]) {
  const onTiersChange = vi.fn();
  render(
    <TicketTierInput
      priceType="paid"
      tiers={tiers}
      onPriceTypeChange={vi.fn()}
      onTiersChange={onTiersChange}
    />
  );
  return { onTiersChange };
}

describe("TicketTierInput price field", () => {
  // Ratchet: type="number" inputs decrement on wheel-scroll while focused,
  // which silently corrupted prices (100000 → 99995, Jul 2026).
  it("never uses a spinner number input for price (single tier)", () => {
    renderPaid([tier()]);
    const input = screen.getByPlaceholderText("pricePlaceholder");
    expect(input).not.toHaveAttribute("type", "number");
    expect(input).toHaveAttribute("inputmode", "numeric");
  });

  it("never uses a spinner number input for price (multiple tiers)", () => {
    renderPaid([tier(), tier()]);
    const inputs = screen.getAllByPlaceholderText("pricePlaceholder");
    expect(inputs).toHaveLength(2);
    for (const input of inputs) {
      expect(input).not.toHaveAttribute("type", "number");
      expect(input).toHaveAttribute("inputmode", "numeric");
    }
  });

  it("parses typed digits into a price", () => {
    const { onTiersChange } = renderPaid([tier()]);
    fireEvent.change(screen.getByPlaceholderText("pricePlaceholder"), {
      target: { value: "100000" },
    });
    expect(onTiersChange).toHaveBeenCalledWith([tier(100000)]);
  });

  it("strips separators from pasted values like 100,000", () => {
    const { onTiersChange } = renderPaid([tier()]);
    fireEvent.change(screen.getByPlaceholderText("pricePlaceholder"), {
      target: { value: "100,000" },
    });
    expect(onTiersChange).toHaveBeenCalledWith([tier(100000)]);
  });
});
