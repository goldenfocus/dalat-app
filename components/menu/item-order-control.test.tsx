import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ItemOrderControl } from "./item-order-control";
vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => (key: string) => key }));
afterEach(cleanup);
const item = { id: "coffee", name: "Coffee", description: null, image_url: null, tags: [], is_sold_out: false, price_vnd: 40000, option_groups: [{ id: "temperature", choices: [{ id: "hot", price_vnd: 0 }, { id: "iced", price_vnd: 0 }] }] };
function Menu() { const [q, setQ] = useState({}); return <ItemOrderControl item={item} quantities={q} onChange={setQ} />; }
it("requires a choice before adding and preserves independently removable variants", () => {
 render(<Menu />);
 expect(screen.getByRole("button", { name: "add" })).toBeDisabled();
 fireEvent.change(screen.getByRole("combobox"), { target: { value: "hot" } });
 fireEvent.click(screen.getByRole("button", { name: "add" }));
 fireEvent.change(screen.getByRole("combobox"), { target: { value: "iced" } });
 fireEvent.click(screen.getByRole("button", { name: "add" }));
 expect(screen.getAllByRole("status")).toHaveLength(2);
 fireEvent.click(screen.getAllByRole("button", { name: "remove" })[0]);
 expect(screen.getAllByRole("status")).toHaveLength(1);
});
