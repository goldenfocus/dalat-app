"use client";

import { useState } from "react";
import { Plus, X, Ticket } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export type PriceType = "free" | "paid" | "donation";

export interface TicketTier {
  name: string;
  price: number;
  currency: string;
  description?: string;
}

interface TicketTierInputProps {
  priceType: PriceType | null;
  tiers: TicketTier[];
  onPriceTypeChange: (type: PriceType | null) => void;
  onTiersChange: (tiers: TicketTier[]) => void;
}

const DEFAULT_TIER: TicketTier = {
  name: "",
  price: 0,
  currency: "VND",
  description: "",
};

export function TicketTierInput({
  priceType,
  tiers,
  onPriceTypeChange,
  onTiersChange,
}: TicketTierInputProps) {
  const t = useTranslations("eventForm");
  const [showMultipleTiers, setShowMultipleTiers] = useState(tiers.length > 1);

  const isPaid = priceType === "paid";
  const isDonation = priceType === "donation";
  const hasPricing = isPaid || isDonation;

  // Handle the "paid event" checkbox
  const handlePaidToggle = (checked: boolean) => {
    if (checked) {
      onPriceTypeChange("paid");
      // Initialize with one tier if empty
      if (tiers.length === 0) {
        onTiersChange([{ ...DEFAULT_TIER }]);
      }
    } else {
      onPriceTypeChange(null);
      onTiersChange([]);
      setShowMultipleTiers(false);
    }
  };

  // Update a single tier field
  const updateTier = (index: number, field: keyof TicketTier, value: string | number) => {
    const updated = [...tiers];
    updated[index] = { ...updated[index], [field]: value };
    onTiersChange(updated);
  };

  // Add a new tier
  const addTier = () => {
    setShowMultipleTiers(true);
    onTiersChange([...tiers, { ...DEFAULT_TIER }]);
  };

  // Remove a tier
  const removeTier = (index: number) => {
    const updated = tiers.filter((_, i) => i !== index);
    onTiersChange(updated);
    if (updated.length <= 1) {
      setShowMultipleTiers(false);
    }
  };

  // Format price for display
  const formatPrice = (price: number, currency: string) => {
    if (currency === "VND") {
      return `${price.toLocaleString()}đ`;
    }
    return `${price} ${currency}`;
  };

  return (
    <div className="space-y-4">
      {/* Main toggle: Is this a paid event? */}
      <div className="flex items-center gap-3">
        <Checkbox
          id="isPaidEvent"
          checked={hasPricing}
          onCheckedChange={handlePaidToggle}
        />
        <Label htmlFor="isPaidEvent" className="cursor-pointer flex items-center gap-2">
          <Ticket className="h-4 w-4 text-muted-foreground" />
          {t("paidEvent")}
        </Label>
      </div>

      {/* Price type selector (only when paid is checked) */}
      {hasPricing && (
        <div className="ml-7 space-y-4">
          {/* Price type: paid vs donation */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="priceType"
                checked={priceType === "paid"}
                onChange={() => onPriceTypeChange("paid")}
                className="h-4 w-4"
              />
              <span className="text-sm">{t("fixedPrice")}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="priceType"
                checked={priceType === "donation"}
                onChange={() => onPriceTypeChange("donation")}
                className="h-4 w-4"
              />
              <span className="text-sm">{t("donation")}</span>
            </label>
          </div>

          {/* Donation message */}
          {isDonation && (
            <p className="text-sm text-muted-foreground">
              {t("donationHelp")}
            </p>
          )}

          {/* Ticket tiers (for paid events) */}
          {isPaid && (
            <div className="space-y-3">
              {tiers.map((tier, index) => (
                <div
                  key={index}
                  className={cn(
                    "rounded-lg border p-3 space-y-3",
                    showMultipleTiers ? "bg-muted/30" : ""
                  )}
                >
                  {/* Tier header with remove button (only for multiple tiers) */}
                  {showMultipleTiers && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {t("tier")} {index + 1}
                      </span>
                      {tiers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeTier(index)}
                          className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Single tier: just price input */}
                  {!showMultipleTiers && (
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <Input
                          type="number"
                          placeholder={t("pricePlaceholder")}
                          value={tier.price || ""}
                          onChange={(e) => updateTier(index, "price", parseInt(e.target.value) || 0)}
                          className="text-right"
                        />
                      </div>
                      <Select
                        value={tier.currency}
                        onValueChange={(value) => updateTier(index, "currency", value)}
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="VND">VND</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                        </SelectContent>
                      </Select>
                      {/* Subtle add button */}
                      <button
                        type="button"
                        onClick={addTier}
                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                        title={t("addTier")}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  {/* Multiple tiers: full form */}
                  {showMultipleTiers && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          placeholder={t("tierName")}
                          value={tier.name}
                          onChange={(e) => updateTier(index, "name", e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            placeholder={t("pricePlaceholder")}
                            value={tier.price || ""}
                            onChange={(e) => updateTier(index, "price", parseInt(e.target.value) || 0)}
                            className="text-right"
                          />
                          <Select
                            value={tier.currency}
                            onValueChange={(value) => updateTier(index, "currency", value)}
                          >
                            <SelectTrigger className="w-20">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="VND">VND</SelectItem>
                              <SelectItem value="USD">USD</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <Input
                        placeholder={t("tierDescription")}
                        value={tier.description || ""}
                        onChange={(e) => updateTier(index, "description", e.target.value)}
                        className="text-sm"
                      />
                    </>
                  )}
                </div>
              ))}

              {/* Add tier button (when in multiple tier mode) */}
              {showMultipleTiers && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addTier}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t("addTier")}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
