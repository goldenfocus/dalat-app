import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventLinksInput } from "./event-links-input";
import { EventContactLinks } from "./event-contact-links";
const upload = vi.hoisted(() => vi.fn());
vi.mock("@/lib/storage/client", () => ({uploadFile: upload}));
const translate = (key: string, args?: {number?:number}) => args?.number ? key + " " + args.number : key;
vi.mock("next-intl", () => ({ useTranslations: () => translate }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => translate }));
afterEach(cleanup);
describe("event links editing and display", () => {
 it("keeps extra links and names aligned when removing the legacy primary slot", () => {
  render(<form data-testid="links"><EventLinksInput primary="https://example.com/original" additional={["https://zalo.me/g/AbC"]} names={{"https://zalo.me/g/AbC":"English & Walking"}}/></form>);
  fireEvent.click(screen.getByRole("button", {name:"removeContactLink 1"}));
  const form = screen.getByTestId("links") as HTMLFormElement;
  const data = new FormData(form);
  expect(data.get("external_chat_url")).toBe("");
  expect(data.getAll("additional_links")).toEqual(["https://zalo.me/g/AbC"]);
  expect(data.getAll("contact_link_name")).toEqual(["","English & Walking"]);
 });
 it("adds another named link without losing the first one", () => {
  render(<form data-testid="links"><EventLinksInput primary="https://zalo.me/g/a"/></form>);
  fireEvent.click(screen.getByRole("button",{name:"addContactLink"}));
  fireEvent.change(screen.getByLabelText("contactLinkNumber 2"),{target:{value:"https://chat.whatsapp.com/AbC"}});
  const fields=screen.getAllByLabelText("contactLinkName");
  fireEvent.change(fields[1],{target:{value:"Walking friends"}});
  const data=new FormData(screen.getByTestId("links") as HTMLFormElement);
  expect(data.get("external_chat_url")).toBe("https://zalo.me/g/a");
  expect(data.getAll("additional_links")).toEqual(["https://chat.whatsapp.com/AbC"]);
  expect(data.getAll("contact_link_name")).toEqual(["","Walking friends"]);
 });
 it("renders named links publicly and filters private source pointers", async () => {
  render(await EventContactLinks({primary:"https://example.com/private-source",hidePrimary:true,additional:["https://zalo.me/g/a","https://chat.whatsapp.com/AbC"],names:{"https://zalo.me/g/a":"English & Walking"}}));
  expect(screen.getByRole("link",{name:/English & Walking/})).toHaveAttribute("href","https://zalo.me/g/a");
  expect(screen.getAllByRole("link")).toHaveLength(2);
  expect(screen.queryByText(/private-source/)).toBeNull();
 });
});

describe("logo uploads", () => {
 it("keeps newer names when an upload finishes", async () => {
   let finish!: (value: {publicUrl:string}) => void;
   upload.mockImplementationOnce(() => new Promise(resolve => {finish=resolve;}));
   render(<form data-testid="links"><EventLinksInput primary="https://zalo.me/g/a"/></form>);
   fireEvent.change(screen.getByLabelText("addLinkImage"),{target:{files:[new File(["image"],"logo.png",{type:"image/png"})]}});
   await waitFor(()=>expect(upload).toHaveBeenCalled());
   expect(document.querySelector('[data-event-link-uploading="true"]')).not.toBeNull();
   fireEvent.change(screen.getByLabelText("contactLinkName"),{target:{value:"Newer community name"}});
   await act(async()=>finish({publicUrl:"https://cdn.example.com/logo.png"}));
   const data=new FormData(screen.getByTestId("links") as HTMLFormElement);
   expect(data.get("contact_link_name")).toBe("Newer community name");
   expect(data.get("contact_link_image")).toBe("https://cdn.example.com/logo.png");
   expect(document.querySelector('[data-event-link-uploading="true"]')).toBeNull();
 });
 it("prevents deleting or changing a link while its image uploads", async () => {
   upload.mockClear();
   let finish!: (value: {publicUrl:string}) => void;
   upload.mockImplementationOnce(() => new Promise(resolve => {finish=resolve;}));
   render(<form data-testid="links"><EventLinksInput primary="https://zalo.me/g/a" additional={["https://t.me/b"]}/></form>);
   fireEvent.change(screen.getAllByLabelText("addLinkImage")[1],{target:{files:[new File(["image"],"logo.png",{type:"image/png"})]}});
   await waitFor(()=>expect(upload).toHaveBeenCalled());
   expect(screen.getByRole("button",{name:"removeContactLink 2"})).toBeDisabled();
   expect(screen.getByLabelText("contactLinkNumber 2")).toBeDisabled();
   await act(async()=>finish({publicUrl:"https://cdn.example.com/logo.png"}));
   fireEvent.click(screen.getByRole("button",{name:"removeContactLink 2"}));
   expect(new FormData(screen.getByTestId("links") as HTMLFormElement).getAll("additional_links")).toEqual([]);
 });
});
