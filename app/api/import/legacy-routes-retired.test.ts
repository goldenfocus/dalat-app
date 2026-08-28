import { describe, expect, it } from "vitest";
import { POST as apifyWebhook } from "./apify-webhook/route";
import { GET as scheduleGet, POST as schedulePost } from "./schedule/route";
import { POST as scheduleRun } from "./schedule/run/route";
import { GET as governmentCron } from "../cron/sync-dalat-gov/route";

async function expectRetired(response: Response) {
  expect(response.status).toBe(410);
  await expect(response.json()).resolves.toMatchObject({
    code: "legacy_event_import_retired",
  });
}

describe("retired legacy background event importers", () => {
  it("does not accept Apify event webhooks", async () => {
    await expectRetired(await apifyWebhook());
  });

  it("does not expose legacy schedule controls", async () => {
    await expectRetired(await scheduleGet());
    await expectRetired(await schedulePost());
    await expectRetired(await scheduleRun());
  });

  it("does not enqueue government articles", async () => {
    await expectRetired(await governmentCron());
  });
});
