import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it } from "vitest";
import messages from "../../messages/en.json";
import { RentalOfferEditor } from "./offer-editor";

afterEach(cleanup);

it("starts with monthly rent and lets a host add or remove distinct custom lease terms", () => {
  render(<NextIntlClientProvider locale="en" timeZone="Asia/Ho_Chi_Minh" messages={messages}>
    <form>
      <RentalOfferEditor initial={null} />
    </form>
  </NextIntlClientProvider>);

  const monthly = screen.getByRole("textbox", { name: "Month to month" });
  const minimum = screen.getByRole("combobox", { name: "Minimum stay" });
  const packages = within(screen.getByRole("group", { name: "Optional lease packages" }));
  const addPackage = packages.getByRole("button", { name: "Add lease package" });
  expect(monthly).toBeRequired();
  expect(packages.queryByRole("spinbutton")).toBeNull();

  fireEvent.change(minimum, { target: { value: "3" } });
  fireEvent.click(addPackage);
  fireEvent.click(addPackage);

  const [first, second] = packages.getAllByRole<HTMLInputElement>("spinbutton", { name: "Lease duration (months)" });
  expect(first.value).toBe("3");
  expect(second.value).toBe("6");
  expect(first.min).toBe("3");
  expect(monthly).not.toBeRequired();
  expect(monthly).toHaveAccessibleName("Monthly rate");

  fireEvent.change(second, { target: { value: "3" } });
  expect(second.validationMessage).toBe("Choose a different duration.");
  fireEvent.change(second, { target: { value: "18" } });
  expect(second.validity.valid).toBe(true);
  expect(first.validity.valid).toBe(true);

  fireEvent.click(packages.getAllByRole("button", { name: "Remove" })[0]);
  expect(packages.getByRole<HTMLInputElement>("spinbutton")).toHaveValue(18);
  fireEvent.click(packages.getByRole("button", { name: "Remove" }));
  expect(monthly).toBeRequired();
});
